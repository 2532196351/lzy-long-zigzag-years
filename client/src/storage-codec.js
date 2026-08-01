const LEGACY_CHECKPOINT_ENCODING = 'lzw-utf8-u16-base64-v1';
const PREVIOUS_CHECKPOINT_ENCODING = 'lzw-utf8-u16-utf16-v2';
const CHECKPOINT_ENCODING = 'lzw-utf8-u16-utf16-blocks-v3';
const MAX_DICTIONARY_CODE = 65_535;
const MAX_CHECKPOINT_JSON_BYTES = 24_000_000;
const MAX_CHECKPOINT_BLOCKS = 256;
const UTF16_PACK_BITS = 15;
const UTF16_PACK_BASE = 0x1000;
const UTF16_PACK_MAX = UTF16_PACK_BASE + 0x7fff;
const UTF16_PACK_CHUNK = 8_192;
const DERIVED_MARKET_MIRROR_PROJECTION_KEY =
  '__lzy_checkpoint_derived_market_mirrors_v1';
const freshCheckpointCache = new WeakMap();

function checksumBytes(bytes) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function checksumBlock(key, bytes) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(key)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash ^= 0;
  hash = Math.imul(hash, 0x01000193) >>> 0;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new Error('Invalid compressed checkpoint payload.');
  }
  let binary;
  try {
    binary = atob(value);
  } catch (error) {
    throw new Error(
      `Invalid compressed checkpoint payload: ${error.message}`,
    );
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function codesToUtf16(codes) {
  const chunks = [];
  let characters = [];
  let buffer = 0;
  let bufferedBits = 0;

  function append(value) {
    characters.push(String.fromCharCode(value + UTF16_PACK_BASE));
    if (characters.length >= UTF16_PACK_CHUNK) {
      chunks.push(characters.join(''));
      characters = [];
    }
  }

  for (const code of codes) {
    buffer = buffer * 65_536 + code;
    bufferedBits += 16;
    while (bufferedBits >= UTF16_PACK_BITS) {
      bufferedBits -= UTF16_PACK_BITS;
      const divisor = 2 ** bufferedBits;
      append(Math.floor(buffer / divisor) & 0x7fff);
      buffer %= divisor;
    }
  }
  if (bufferedBits > 0) {
    append(buffer * 2 ** (UTF16_PACK_BITS - bufferedBits));
  }
  if (characters.length > 0) chunks.push(characters.join(''));
  return chunks.join('');
}

function utf16ToCodes(value, expectedCodeCount) {
  if (
    typeof value !== 'string' ||
    value.length !==
      Math.ceil((expectedCodeCount * 16) / UTF16_PACK_BITS)
  ) {
    throw new Error('Invalid compressed checkpoint packed length.');
  }
  const codes = new Uint16Array(expectedCodeCount);
  let codeIndex = 0;
  let buffer = 0;
  let bufferedBits = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (
      codeUnit < UTF16_PACK_BASE ||
      codeUnit > UTF16_PACK_MAX
    ) {
      throw new Error('Invalid compressed checkpoint packed character.');
    }
    buffer =
      buffer * 32_768 +
      (codeUnit - UTF16_PACK_BASE);
    bufferedBits += UTF16_PACK_BITS;
    while (bufferedBits >= 16 && codeIndex < expectedCodeCount) {
      bufferedBits -= 16;
      const divisor = 2 ** bufferedBits;
      codes[codeIndex] =
        Math.floor(buffer / divisor) & 0xffff;
      codeIndex += 1;
      buffer %= divisor;
    }
  }
  if (
    codeIndex !== expectedCodeCount ||
    buffer !== 0
  ) {
    throw new Error('Invalid compressed checkpoint packed padding.');
  }
  return codes;
}

function lzwEncode(bytes) {
  if (bytes.length === 0) return new Uint16Array();
  // A transition is uniquely identified by (prefix-code, next byte). Keeping
  // that pair as one safe integer avoids allocating a growing UTF-16 phrase
  // for every source byte while producing the exact same LZW code stream.
  const dictionary = new Map();
  let nextCode = 256;
  let phraseCode = bytes[0];
  const codes = [];
  for (let index = 1; index < bytes.length; index += 1) {
    const byte = bytes[index];
    const transition = phraseCode * 256 + byte;
    const combinedCode = dictionary.get(transition);
    if (combinedCode !== undefined) {
      phraseCode = combinedCode;
      continue;
    }
    codes.push(phraseCode);
    if (nextCode <= MAX_DICTIONARY_CODE) {
      dictionary.set(transition, nextCode);
      nextCode += 1;
    }
    phraseCode = byte;
  }
  codes.push(phraseCode);
  return Uint16Array.from(codes);
}

function lzwDecode(codes, expectedLength) {
  if (codes.length === 0 || expectedLength <= 0) {
    throw new Error('Invalid compressed checkpoint code stream.');
  }
  const prefixes = new Uint16Array(MAX_DICTIONARY_CODE + 1);
  const suffixes = new Uint8Array(MAX_DICTIONARY_CODE + 1);
  const stack = new Uint8Array(MAX_DICTIONARY_CODE + 1);
  for (let value = 0; value < 256; value += 1) {
    suffixes[value] = value;
  }
  let nextCode = 256;
  let previousCode = codes[0];
  if (previousCode >= 256) {
    throw new Error('Invalid compressed checkpoint first code.');
  }
  const output = new Uint8Array(expectedLength);
  output[0] = previousCode;
  let outputLength = 1;
  let previousFirstByte = previousCode;

  function writeCode(code) {
    let cursor = code;
    let stackLength = 0;
    while (cursor >= 256) {
      if (cursor >= nextCode || stackLength >= stack.length) {
        throw new Error('Invalid compressed checkpoint dictionary code.');
      }
      stack[stackLength] = suffixes[cursor];
      stackLength += 1;
      cursor = prefixes[cursor];
    }
    const firstByte = cursor;
    stack[stackLength] = firstByte;
    stackLength += 1;
    if (outputLength + stackLength > expectedLength) {
      throw new Error('Compressed checkpoint exceeds its declared length.');
    }
    while (stackLength > 0) {
      stackLength -= 1;
      output[outputLength] = stack[stackLength];
      outputLength += 1;
    }
    return firstByte;
  }

  for (let index = 1; index < codes.length; index += 1) {
    const code = codes[index];
    let firstByte;
    if (code < nextCode) {
      firstByte = writeCode(code);
    } else if (code === nextCode) {
      writeCode(previousCode);
      if (outputLength >= expectedLength) {
        throw new Error('Compressed checkpoint exceeds its declared length.');
      }
      output[outputLength] = previousFirstByte;
      outputLength += 1;
      firstByte = previousFirstByte;
    } else {
      throw new Error('Invalid compressed checkpoint dictionary code.');
    }
    if (nextCode <= MAX_DICTIONARY_CODE) {
      prefixes[nextCode] = previousCode;
      suffixes[nextCode] = firstByte;
      nextCode += 1;
    }
    previousCode = code;
    previousFirstByte = firstByte;
  }
  if (outputLength !== expectedLength) {
    throw new Error('Compressed checkpoint length does not match.');
  }
  return output;
}

function freshCacheMatches(encoded, cached) {
  if (
    !cached ||
    encoded.encoding !== CHECKPOINT_ENCODING ||
    encoded.data !== cached.data ||
    encoded.jsonBytes !== cached.jsonBytes ||
    encoded.codeCount !== cached.codeCount ||
    !Array.isArray(encoded.blocks) ||
    encoded.blocks.length !== cached.blocks.length
  ) {
    return false;
  }
  for (let index = 0; index < encoded.blocks.length; index += 1) {
    const block = encoded.blocks[index];
    const expected = cached.blocks[index];
    if (
      !block ||
      block.key !== expected.key ||
      block.jsonBytes !== expected.jsonBytes ||
      block.codeCount !== expected.codeCount ||
      block.dataLength !== expected.dataLength ||
      block.checksum !== expected.checksum
    ) {
      return false;
    }
  }
  return true;
}

function decodeFreshCheckpoint(cached) {
  const checkpoint = {};
  for (const block of cached.blocks) {
    let value;
    try {
      value = JSON.parse(block.json);
    } catch (error) {
      throw new Error(
        `Invalid compressed checkpoint JSON: ${error.message}`,
      );
    }
    Object.defineProperty(checkpoint, block.key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  return checkpoint;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function exactOrderedKeys(value, expected) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    !Array.isArray(expected)
  ) {
    return false;
  }
  const actual = Object.keys(value);
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]) &&
    new Set(expected).size === expected.length
  );
}

function derivedOrderMirror(order) {
  return {
    ...order,
    liquidityLayer: order.liquidityLayer
      ? cloneJson(order.liquidityLayer)
      : null,
    actorId: order.ownerId,
    quantity: order.originalQty,
    remainingQuantity: order.remainingQty,
    source: 'realtime_order_book',
  };
}

function sortedBookPrices(levels, side) {
  return Object.keys(levels)
    .map(Number)
    .sort((left, right) =>
      side === 'buy' ? right - left : left - right);
}

function derivedBookMirror(book, worldTick) {
  if (
    !book ||
    typeof book !== 'object' ||
    !book.bids ||
    !book.asks ||
    !book.orders
  ) {
    throw new Error('Invalid canonical order book projection.');
  }
  function levels(side) {
    const source = side === 'buy' ? book.bids : book.asks;
    return sortedBookPrices(source, side).map((priceTicks) => {
      const queue = source[String(priceTicks)];
      if (!Array.isArray(queue) || queue.length === 0) {
        throw new Error('Invalid canonical order book projection.');
      }
      const quantity = queue.reduce((sum, orderId) => {
        const order = book.orders[orderId];
        if (
          !order ||
          !Number.isSafeInteger(order.remainingQty) ||
          order.remainingQty < 1
        ) {
          throw new Error('Invalid canonical order book projection.');
        }
        return sum + order.remainingQty;
      }, 0);
      return {
        price: priceTicks / 100,
        quantity,
      };
    });
  }
  return {
    bids: levels('buy'),
    asks: levels('sell'),
    lastUpdatedTick: worldTick,
    authority: 'realtime_order_book_derived_view',
  };
}

function deriveMarketMirrors(checkpoint, {
  bookSymbolOrder,
  orderBookSymbolOrder,
} = {}) {
  const books = checkpoint?.books;
  const world = checkpoint?.world;
  const worldTick = world?.world?.tick;
  if (
    !Number.isSafeInteger(worldTick) ||
    !exactOrderedKeys(books, bookSymbolOrder) ||
    !Array.isArray(orderBookSymbolOrder) ||
    new Set(orderBookSymbolOrder).size !==
      orderBookSymbolOrder.length ||
    orderBookSymbolOrder.some(
      (symbol) => !Object.hasOwn(books, symbol),
    )
  ) {
    throw new Error('Invalid canonical market mirror projection.');
  }
  const orders = bookSymbolOrder.flatMap((symbol) =>
    Object.values(books[symbol].orders).map(derivedOrderMirror));
  const orderBooks = Object.fromEntries(
    orderBookSymbolOrder.map((symbol) => [
      symbol,
      derivedBookMirror(books[symbol], worldTick),
    ]),
  );
  return { orders, orderBooks };
}

function projectDerivedMarketMirrors(checkpoint) {
  if (Object.hasOwn(
    checkpoint,
    DERIVED_MARKET_MIRROR_PROJECTION_KEY,
  )) {
    throw new TypeError(
      'Checkpoint uses a reserved codec projection key.',
    );
  }
  const world = checkpoint.world;
  const market = world?.market;
  const books = checkpoint.books;
  if (
    !world ||
    !market ||
    !books ||
    !Array.isArray(market.orders) ||
    !market.orderBooks ||
    typeof market.orderBooks !== 'object' ||
    Array.isArray(market.orderBooks)
  ) {
    return checkpoint;
  }
  const projection = {
    version: 1,
    worldMarketKeys: Object.keys(market),
    bookSymbolOrder: Object.keys(books),
    orderBookSymbolOrder: Object.keys(market.orderBooks),
  };
  let derived;
  try {
    derived = deriveMarketMirrors(checkpoint, projection);
  } catch {
    return checkpoint;
  }
  if (
    JSON.stringify(derived.orders) !==
      JSON.stringify(market.orders) ||
    JSON.stringify(derived.orderBooks) !==
      JSON.stringify(market.orderBooks)
  ) {
    return checkpoint;
  }
  const projectedMarket = Object.fromEntries(
    Object.entries(market).filter(
      ([key]) => key !== 'orders' && key !== 'orderBooks',
    ),
  );
  const projectedWorld = {
    ...world,
    market: projectedMarket,
  };
  const projectedCheckpoint = Object.fromEntries(
    Object.entries(checkpoint).map(([key, value]) => [
      key,
      key === 'world' ? projectedWorld : value,
    ]),
  );
  projectedCheckpoint[DERIVED_MARKET_MIRROR_PROJECTION_KEY] =
    projection;
  return projectedCheckpoint;
}

function restoreDerivedMarketMirrors(checkpoint) {
  if (!Object.hasOwn(
    checkpoint,
    DERIVED_MARKET_MIRROR_PROJECTION_KEY,
  )) {
    return checkpoint;
  }
  const projection =
    checkpoint[DERIVED_MARKET_MIRROR_PROJECTION_KEY];
  const market = checkpoint.world?.market;
  if (
    !projection ||
    projection.version !== 1 ||
    !Array.isArray(projection.worldMarketKeys) ||
    new Set(projection.worldMarketKeys).size !==
      projection.worldMarketKeys.length ||
    !projection.worldMarketKeys.includes('orders') ||
    !projection.worldMarketKeys.includes('orderBooks') ||
    Object.hasOwn(market ?? {}, 'orders') ||
    Object.hasOwn(market ?? {}, 'orderBooks')
  ) {
    throw new Error('Invalid checkpoint market mirror projection.');
  }
  const retainedKeys = projection.worldMarketKeys.filter(
    (key) => key !== 'orders' && key !== 'orderBooks',
  );
  if (!exactOrderedKeys(market, retainedKeys)) {
    throw new Error('Invalid checkpoint market mirror projection.');
  }
  const derived = deriveMarketMirrors(checkpoint, projection);
  const restoredMarket = {};
  for (const key of projection.worldMarketKeys) {
    if (key === 'orders') {
      restoredMarket[key] = derived.orders;
    } else if (key === 'orderBooks') {
      restoredMarket[key] = derived.orderBooks;
    } else {
      restoredMarket[key] = market[key];
    }
  }
  checkpoint.world = {
    ...checkpoint.world,
    market: restoredMarket,
  };
  delete checkpoint[DERIVED_MARKET_MIRROR_PROJECTION_KEY];
  return checkpoint;
}

export function encodeCheckpoint(checkpoint) {
  if (
    !checkpoint ||
    typeof checkpoint !== 'object' ||
    Array.isArray(checkpoint)
  ) {
    throw new TypeError('Checkpoint must be a JSON object.');
  }
  const projectedCheckpoint =
    projectDerivedMarketMirrors(checkpoint);
  const encoder = new TextEncoder();
  const blocks = [];
  const packedBlocks = [];
  const cachedBlocks = [];
  let jsonBytes = 0;
  let codeCount = 0;
  try {
    for (const [key, value] of Object.entries(projectedCheckpoint)) {
      const json = JSON.stringify(value);
      if (json === undefined) continue;
      const source = encoder.encode(json);
      jsonBytes += source.length;
      if (jsonBytes > MAX_CHECKPOINT_JSON_BYTES) {
        throw new Error(
          'Checkpoint JSON exceeds the codec safety bound.',
        );
      }
      const codes = lzwEncode(source);
      const data = codesToUtf16(codes);
      const block = {
        key,
        jsonBytes: source.length,
        codeCount: codes.length,
        dataLength: data.length,
        checksum: checksumBlock(key, source),
      };
      blocks.push(block);
      cachedBlocks.push({
        ...block,
        json,
      });
      packedBlocks.push(data);
      codeCount += codes.length;
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message ===
        'Checkpoint JSON exceeds the codec safety bound.'
    ) {
      throw error;
    }
    throw new TypeError(
      `Checkpoint must be JSON serializable: ${error.message}`,
    );
  }
  if (
    blocks.length === 0 ||
    blocks.length > MAX_CHECKPOINT_BLOCKS ||
    jsonBytes === 0
  ) {
    throw new Error('Checkpoint JSON exceeds the codec safety bound.');
  }
  const encoded = {
    encoding: CHECKPOINT_ENCODING,
    data: packedBlocks.join(''),
    jsonBytes,
    codeCount,
    blocks,
  };
  freshCheckpointCache.set(encoded, {
    data: encoded.data,
    jsonBytes,
    codeCount,
    blocks: cachedBlocks,
  });
  return encoded;
}

export function decodeCheckpoint(encoded) {
  if (
    !encoded ||
    ![
      CHECKPOINT_ENCODING,
      PREVIOUS_CHECKPOINT_ENCODING,
      LEGACY_CHECKPOINT_ENCODING,
    ].includes(encoded.encoding)
  ) {
    throw new Error('Unsupported checkpoint encoding.');
  }
  if (encoded.encoding === CHECKPOINT_ENCODING) {
    const fresh = freshCheckpointCache.get(encoded);
    freshCheckpointCache.delete(encoded);
    if (freshCacheMatches(encoded, fresh)) {
      return restoreDerivedMarketMirrors(
        decodeFreshCheckpoint(fresh),
      );
    }
    if (
      !Array.isArray(encoded.blocks) ||
      encoded.blocks.length === 0 ||
      encoded.blocks.length > MAX_CHECKPOINT_BLOCKS ||
      typeof encoded.data !== 'string'
    ) {
      throw new Error('Invalid compressed checkpoint blocks.');
    }
    const keys = new Set();
    let dataOffset = 0;
    let totalJsonBytes = 0;
    let totalCodeCount = 0;
    const checkpoint = {};
    for (const block of encoded.blocks) {
      if (
        !block ||
        typeof block.key !== 'string' ||
        keys.has(block.key) ||
        !Number.isSafeInteger(block.jsonBytes) ||
        block.jsonBytes <= 0 ||
        !Number.isSafeInteger(block.codeCount) ||
        block.codeCount <= 0 ||
        block.codeCount > block.jsonBytes ||
        !Number.isSafeInteger(block.dataLength) ||
        block.dataLength <= 0 ||
        block.dataLength !==
          Math.ceil((block.codeCount * 16) / UTF16_PACK_BITS) ||
        typeof block.checksum !== 'string' ||
        !/^[0-9a-f]{8}$/.test(block.checksum)
      ) {
        throw new Error('Invalid compressed checkpoint block metadata.');
      }
      keys.add(block.key);
      totalJsonBytes += block.jsonBytes;
      totalCodeCount += block.codeCount;
      if (
        totalJsonBytes > MAX_CHECKPOINT_JSON_BYTES ||
        dataOffset + block.dataLength > encoded.data.length
      ) {
        throw new Error('Invalid compressed checkpoint block bounds.');
      }
      const packed = encoded.data.slice(
        dataOffset,
        dataOffset + block.dataLength,
      );
      dataOffset += block.dataLength;
      const codes = utf16ToCodes(packed, block.codeCount);
      const source = lzwDecode(codes, block.jsonBytes);
      if (checksumBlock(block.key, source) !== block.checksum) {
        throw new Error(
          'Compressed checkpoint block checksum does not match.',
        );
      }
      let json;
      try {
        json = new TextDecoder('utf-8', { fatal: true }).decode(
          source,
        );
      } catch (error) {
        throw new Error(
          `Invalid compressed checkpoint UTF-8: ${error.message}`,
        );
      }
      let value;
      try {
        value = JSON.parse(json);
      } catch (error) {
        throw new Error(
          `Invalid compressed checkpoint JSON: ${error.message}`,
        );
      }
      Object.defineProperty(checkpoint, block.key, {
        value,
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    if (
      dataOffset !== encoded.data.length ||
      totalJsonBytes !== encoded.jsonBytes ||
      totalCodeCount !== encoded.codeCount
    ) {
      throw new Error('Invalid compressed checkpoint block totals.');
    }
    return restoreDerivedMarketMirrors(checkpoint);
  }
  if (
    !Number.isSafeInteger(encoded.jsonBytes) ||
    encoded.jsonBytes <= 0 ||
    encoded.jsonBytes > MAX_CHECKPOINT_JSON_BYTES ||
    !Number.isSafeInteger(encoded.codeCount) ||
    encoded.codeCount <= 0 ||
    encoded.codeCount > encoded.jsonBytes
  ) {
    throw new Error('Invalid compressed checkpoint metadata.');
  }
  let codes;
  if (encoded.encoding === PREVIOUS_CHECKPOINT_ENCODING) {
    codes = utf16ToCodes(encoded.data, encoded.codeCount);
  } else {
    const codeBytes = base64ToBytes(encoded.data);
    if (
      codeBytes.length !== encoded.codeCount * 2 ||
      codeBytes.length % 2 !== 0
    ) {
      throw new Error('Invalid compressed checkpoint code length.');
    }
    const view = new DataView(
      codeBytes.buffer,
      codeBytes.byteOffset,
      codeBytes.byteLength,
    );
    codes = new Uint16Array(encoded.codeCount);
    for (let index = 0; index < codes.length; index += 1) {
      codes[index] = view.getUint16(index * 2, false);
    }
  }
  const source = lzwDecode(codes, encoded.jsonBytes);
  if (checksumBytes(source) !== encoded.checksum) {
    throw new Error('Compressed checkpoint checksum does not match.');
  }
  let json;
  try {
    json = new TextDecoder('utf-8', { fatal: true }).decode(source);
  } catch (error) {
    throw new Error(
      `Invalid compressed checkpoint UTF-8: ${error.message}`,
    );
  }
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Invalid compressed checkpoint JSON: ${error.message}`,
    );
  }
}
