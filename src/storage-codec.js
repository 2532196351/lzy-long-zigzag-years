const LEGACY_CHECKPOINT_ENCODING = 'lzw-utf8-u16-base64-v1';
const PREVIOUS_CHECKPOINT_ENCODING = 'lzw-utf8-u16-utf16-v2';
const PREVIOUS_BLOCK_CHECKPOINT_ENCODING =
  'lzw-utf8-u16-utf16-blocks-v3';
const PREVIOUS_CHUNKED_CHECKPOINT_ENCODING =
  'lzw-utf8-u16-utf16-chunked-v4';
const CHECKPOINT_ENCODING =
  'lzw-utf8-u16-utf16-binary-audit-v5';
const MAX_DICTIONARY_CODE = 65_535;
const MAX_CHECKPOINT_JSON_BYTES = 24_000_000;
const MAX_CHECKPOINT_BLOCKS = 256;
const LZW_DICTIONARY_RESET_BYTES = 512_000;
const MAX_LZW_DICTIONARY_RESET_BYTES = 2_000_000;
const UTF16_PACK_BITS = 15;
const UTF16_PACK_BASE = 0x1000;
const UTF16_PACK_MAX = UTF16_PACK_BASE + 0x7fff;
const UTF16_PACK_CHUNK = 8_192;
const DERIVED_MARKET_MIRROR_PROJECTION_KEY =
  '__lzy_checkpoint_derived_market_mirrors_v1';
const COMPACT_BOOKS_PROJECTION_KEY =
  '__lzy_checkpoint_compact_books_v1';
const COMPACT_BAR_ARCHIVES_PROJECTION_KEY =
  '__lzy_checkpoint_compact_bar_archives_v1';
const COMPACT_DERIVATIVE_CADENCE_ARCHIVE_PROJECTION_KEY =
  '__lzy_checkpoint_compact_derivative_cadence_archive_v1';
const PACKED_AUDIT_PAYLOADS_PROJECTION_KEY =
  '__lzy_checkpoint_packed_audit_payloads_v1';
const PACKED_AUDIT_PAYLOAD_ENCODING =
  'lzy_checkpoint_binary_attachment_ref_v1';
const AUDIT_PAYLOAD_ENCODING =
  'lzy_realtime_audit_lz4_json_base64_v1';
const freshCheckpointCache = new WeakMap();

function dictionaryResetBytesForBlock(key) {
  if (
    key === 'books' ||
    key === 'agentEcology' ||
    key === 'orderArchive'
  ) {
    return 1_000_000;
  }
  if (key === 'quoteFrames') return 2_000_000;
  return LZW_DICTIONARY_RESET_BYTES;
}

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

function bytesToUtf16(bytes) {
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

  for (const byte of bytes) {
    buffer = buffer * 256 + byte;
    bufferedBits += 8;
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

function utf16ToBytes(value, expectedByteCount) {
  if (
    typeof value !== 'string' ||
    !Number.isSafeInteger(expectedByteCount) ||
    expectedByteCount <= 0 ||
    value.length !==
      Math.ceil((expectedByteCount * 8) / UTF16_PACK_BITS)
  ) {
    throw new Error('Invalid packed audit payload length.');
  }
  const bytes = new Uint8Array(expectedByteCount);
  let byteIndex = 0;
  let buffer = 0;
  let bufferedBits = 0;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (
      codeUnit < UTF16_PACK_BASE ||
      codeUnit > UTF16_PACK_MAX
    ) {
      throw new Error('Invalid packed audit payload character.');
    }
    buffer =
      buffer * 32_768 +
      (codeUnit - UTF16_PACK_BASE);
    bufferedBits += UTF16_PACK_BITS;
    while (bufferedBits >= 8 && byteIndex < expectedByteCount) {
      bufferedBits -= 8;
      const divisor = 2 ** bufferedBits;
      bytes[byteIndex] =
        Math.floor(buffer / divisor) & 0xff;
      byteIndex += 1;
      buffer %= divisor;
    }
  }
  if (byteIndex !== expectedByteCount || buffer !== 0) {
    throw new Error('Invalid packed audit payload padding.');
  }
  return bytes;
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
      block.dictionaryResetBytes !==
        expected.dictionaryResetBytes ||
      block.compressedDataLength !==
        expected.compressedDataLength ||
      block.dataLength !== expected.dataLength ||
      block.checksum !== expected.checksum ||
      JSON.stringify(block.chunks) !==
        JSON.stringify(expected.chunks) ||
      JSON.stringify(block.attachments ?? []) !==
        JSON.stringify(expected.attachments ?? [])
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

function projectCompactBooks(checkpoint) {
  if (
    Object.hasOwn(
      checkpoint,
      COMPACT_BOOKS_PROJECTION_KEY,
    ) ||
    !checkpoint.books ||
    typeof checkpoint.books !== 'object' ||
    Array.isArray(checkpoint.books)
  ) {
    return checkpoint;
  }
  const shapes = [];
  const shapeIndexBySignature = new Map();
  const bookRows = [];
  try {
    for (const [symbol, book] of Object.entries(
      checkpoint.books,
    )) {
      if (
        !exactOrderedKeys(book, [
          'symbol',
          'bids',
          'asks',
          'orders',
          'nextSequence',
        ]) ||
        book.symbol !== symbol ||
        !book.bids ||
        !book.asks ||
        !book.orders ||
        !Number.isSafeInteger(book.nextSequence)
      ) {
        return checkpoint;
      }
      const orderRows = [];
      for (const [orderId, order] of Object.entries(
        book.orders,
      )) {
        if (
          !order ||
          typeof order !== 'object' ||
          Array.isArray(order) ||
          order.id !== orderId
        ) {
          return checkpoint;
        }
        const keys = Object.keys(order);
        if (
          keys.length === 0 ||
          new Set(keys).size !== keys.length ||
          keys.some(
            (key) => order[key] === undefined,
          )
        ) {
          return checkpoint;
        }
        const signature = JSON.stringify(keys);
        let shapeIndex =
          shapeIndexBySignature.get(signature);
        if (shapeIndex === undefined) {
          shapeIndex = shapes.length;
          shapes.push(keys);
          shapeIndexBySignature.set(
            signature,
            shapeIndex,
          );
        }
        orderRows.push([
          shapeIndex,
          ...keys.map((key) => order[key]),
        ]);
      }
      const levelRows = (levels) =>
        Object.entries(levels).map(
          ([priceTicks, queue]) => [
            Number(priceTicks),
            queue,
          ],
        );
      bookRows.push([
        symbol,
        book.nextSequence,
        levelRows(book.bids),
        levelRows(book.asks),
        orderRows,
      ]);
    }
  } catch {
    return checkpoint;
  }
  if (bookRows.length === 0) return checkpoint;
  const projected = {
    ...checkpoint,
    books: {
      version: 1,
      shapes,
      rows: bookRows,
    },
  };
  projected[COMPACT_BOOKS_PROJECTION_KEY] = {
    version: 1,
    symbolOrder: Object.keys(checkpoint.books),
  };
  return projected;
}

function restoreCompactBooks(checkpoint) {
  if (!Object.hasOwn(
    checkpoint,
    COMPACT_BOOKS_PROJECTION_KEY,
  )) {
    return checkpoint;
  }
  const projection =
    checkpoint[COMPACT_BOOKS_PROJECTION_KEY];
  const compact = checkpoint.books;
  if (
    projection?.version !== 1 ||
    compact?.version !== 1 ||
    !Array.isArray(projection.symbolOrder) ||
    new Set(projection.symbolOrder).size !==
      projection.symbolOrder.length ||
    !Array.isArray(compact.shapes) ||
    !Array.isArray(compact.rows) ||
    compact.rows.length !==
      projection.symbolOrder.length
  ) {
    throw new Error(
      'Invalid checkpoint compact book projection.',
    );
  }
  const shapes = compact.shapes.map((keys) => {
    if (
      !Array.isArray(keys) ||
      keys.length === 0 ||
      new Set(keys).size !== keys.length ||
      keys.some(
        (key) =>
          typeof key !== 'string' ||
          key.length === 0,
      )
    ) {
      throw new Error(
        'Invalid checkpoint compact order shape.',
      );
    }
    return keys;
  });
  const books = {};
  const restoreLevels = (rows) => {
    if (!Array.isArray(rows)) {
      throw new Error(
        'Invalid checkpoint compact price levels.',
      );
    }
    const levels = {};
    for (const row of rows) {
      if (
        !Array.isArray(row) ||
        row.length !== 2 ||
        !Number.isSafeInteger(row[0]) ||
        row[0] <= 0 ||
        !Array.isArray(row[1]) ||
        row[1].length === 0
      ) {
        throw new Error(
          'Invalid checkpoint compact price level.',
        );
      }
      levels[String(row[0])] = row[1];
    }
    return levels;
  };
  compact.rows.forEach((row, bookIndex) => {
    if (
      !Array.isArray(row) ||
      row.length !== 5 ||
      row[0] !== projection.symbolOrder[bookIndex] ||
      !Number.isSafeInteger(row[1]) ||
      !Array.isArray(row[4])
    ) {
      throw new Error(
        'Invalid checkpoint compact book row.',
      );
    }
    const orders = {};
    for (const orderRow of row[4]) {
      const shapeIndex = orderRow?.[0];
      const keys = shapes[shapeIndex];
      if (
        !Array.isArray(orderRow) ||
        !Number.isSafeInteger(shapeIndex) ||
        !keys ||
        orderRow.length !== keys.length + 1
      ) {
        throw new Error(
          'Invalid checkpoint compact order row.',
        );
      }
      const order = Object.fromEntries(
        keys.map((key, index) => [
          key,
          orderRow[index + 1],
        ]),
      );
      if (
        typeof order.id !== 'string' ||
        order.id.length === 0 ||
        Object.hasOwn(orders, order.id)
      ) {
        throw new Error(
          'Invalid checkpoint compact order identity.',
        );
      }
      orders[order.id] = order;
    }
    const symbol = row[0];
    books[symbol] = {
      symbol,
      bids: restoreLevels(row[2]),
      asks: restoreLevels(row[3]),
      orders,
      nextSequence: row[1],
    };
  });
  checkpoint.books = books;
  delete checkpoint[COMPACT_BOOKS_PROJECTION_KEY];
  return checkpoint;
}

const VISIBLE_BAR_KEYS = [
  'symbol',
  'dayId',
  'frameStartMs',
  'frameEndMs',
  'startMs',
  'endMs',
  'openTicks',
  'highTicks',
  'lowTicks',
  'closeTicks',
  'volumeShares',
  'volume',
  'turnoverCents',
  'turnoverTicks',
  'tradeCount',
  'vwapTicks',
];
const ULTRA_FILL_KEYS = [
  'timestampMs',
  'sequence',
  'priceTicks',
  'quantity',
];

function compactVisibleBar(bar, symbol) {
  if (
    !exactOrderedKeys(bar, VISIBLE_BAR_KEYS) ||
    bar.symbol !== symbol ||
    bar.frameStartMs !== bar.startMs ||
    bar.frameEndMs !== bar.endMs ||
    bar.volumeShares !== bar.volume ||
    bar.turnoverCents !== bar.turnoverTicks ||
    Object.values(bar).some((value) => value === undefined)
  ) {
    return null;
  }
  return [
    bar.dayId,
    bar.startMs,
    bar.endMs,
    bar.openTicks,
    bar.highTicks,
    bar.lowTicks,
    bar.closeTicks,
    bar.volume,
    bar.turnoverTicks,
    bar.tradeCount,
    bar.vwapTicks,
  ];
}

function compactUltraFill(fill) {
  if (
    !exactOrderedKeys(fill, ULTRA_FILL_KEYS) ||
    Object.values(fill).some((value) => value === undefined)
  ) {
    return null;
  }
  return ULTRA_FILL_KEYS.map((key) => fill[key]);
}

function projectCompactBarArchives(checkpoint) {
  if (Object.hasOwn(
    checkpoint,
    COMPACT_BAR_ARCHIVES_PROJECTION_KEY,
  )) {
    throw new TypeError(
      'Checkpoint uses a reserved codec projection key.',
    );
  }
  const archive = checkpoint.barArchives;
  const bySymbol = archive?.bySymbol;
  if (
    !exactOrderedKeys(archive, ['bySymbol']) ||
    !bySymbol ||
    typeof bySymbol !== 'object' ||
    Array.isArray(bySymbol)
  ) {
    return checkpoint;
  }
  const rows = [];
  try {
    for (const [symbol, entry] of Object.entries(bySymbol)) {
      if (
        typeof symbol !== 'string' ||
        symbol.length === 0 ||
        !exactOrderedKeys(entry, [
          'minuteBars',
          'dailyBars',
          'ultraFills',
        ]) ||
        !Array.isArray(entry.minuteBars) ||
        !Array.isArray(entry.dailyBars) ||
        !Array.isArray(entry.ultraFills)
      ) {
        return checkpoint;
      }
      const minuteBars = entry.minuteBars.map((bar) =>
        compactVisibleBar(bar, symbol));
      const dailyBars = entry.dailyBars.map((bar) =>
        compactVisibleBar(bar, symbol));
      const ultraFills = entry.ultraFills.map(compactUltraFill);
      if (
        minuteBars.some((row) => row === null) ||
        dailyBars.some((row) => row === null) ||
        ultraFills.some((row) => row === null)
      ) {
        return checkpoint;
      }
      rows.push([
        symbol,
        minuteBars,
        dailyBars,
        ultraFills,
      ]);
    }
  } catch {
    return checkpoint;
  }
  if (rows.length === 0) return checkpoint;
  const projected = {
    ...checkpoint,
    barArchives: {
      version: 1,
      rows,
    },
  };
  projected[COMPACT_BAR_ARCHIVES_PROJECTION_KEY] = {
    version: 1,
    symbolOrder: Object.keys(bySymbol),
  };
  return projected;
}

function restoreCompactBarArchives(checkpoint) {
  if (!Object.hasOwn(
    checkpoint,
    COMPACT_BAR_ARCHIVES_PROJECTION_KEY,
  )) {
    return checkpoint;
  }
  const projection =
    checkpoint[COMPACT_BAR_ARCHIVES_PROJECTION_KEY];
  const compact = checkpoint.barArchives;
  if (
    !exactOrderedKeys(projection, ['version', 'symbolOrder']) ||
    projection.version !== 1 ||
    !Array.isArray(projection.symbolOrder) ||
    projection.symbolOrder.length === 0 ||
    new Set(projection.symbolOrder).size !==
      projection.symbolOrder.length ||
    projection.symbolOrder.some(
      (symbol) =>
        typeof symbol !== 'string' || symbol.length === 0,
    ) ||
    !exactOrderedKeys(compact, ['version', 'rows']) ||
    compact.version !== 1 ||
    !Array.isArray(compact.rows) ||
    compact.rows.length !== projection.symbolOrder.length
  ) {
    throw new Error(
      'Invalid checkpoint compact bar archive projection.',
    );
  }
  const restoreVisibleBars = (rows, symbol) => {
    if (!Array.isArray(rows)) {
      throw new Error(
        'Invalid checkpoint compact visible bars.',
      );
    }
    return rows.map((row) => {
      if (
        !Array.isArray(row) ||
        row.length !== 11 ||
        row.some((value) => value === undefined)
      ) {
        throw new Error(
          'Invalid checkpoint compact visible bar row.',
        );
      }
      const [
        dayId,
        startMs,
        endMs,
        openTicks,
        highTicks,
        lowTicks,
        closeTicks,
        volume,
        turnoverTicks,
        tradeCount,
        vwapTicks,
      ] = row;
      return {
        symbol,
        dayId,
        frameStartMs: startMs,
        frameEndMs: endMs,
        startMs,
        endMs,
        openTicks,
        highTicks,
        lowTicks,
        closeTicks,
        volumeShares: volume,
        volume,
        turnoverCents: turnoverTicks,
        turnoverTicks,
        tradeCount,
        vwapTicks,
      };
    });
  };
  const restoreUltraFills = (rows) => {
    if (!Array.isArray(rows)) {
      throw new Error(
        'Invalid checkpoint compact ultra fills.',
      );
    }
    return rows.map((row) => {
      if (
        !Array.isArray(row) ||
        row.length !== ULTRA_FILL_KEYS.length ||
        row.some((value) => value === undefined)
      ) {
        throw new Error(
          'Invalid checkpoint compact ultra fill row.',
        );
      }
      return Object.fromEntries(
        ULTRA_FILL_KEYS.map((key, index) => [key, row[index]]),
      );
    });
  };
  const bySymbol = {};
  compact.rows.forEach((row, index) => {
    const symbol = projection.symbolOrder[index];
    if (
      !Array.isArray(row) ||
      row.length !== 4 ||
      row[0] !== symbol
    ) {
      throw new Error(
        'Invalid checkpoint compact bar archive row.',
      );
    }
    bySymbol[symbol] = {
      minuteBars: restoreVisibleBars(row[1], symbol),
      dailyBars: restoreVisibleBars(row[2], symbol),
      ultraFills: restoreUltraFills(row[3]),
    };
  });
  checkpoint.barArchives = { bySymbol };
  delete checkpoint[COMPACT_BAR_ARCHIVES_PROJECTION_KEY];
  return checkpoint;
}

function projectCompactDerivativeCadenceArchive(checkpoint) {
  if (Object.hasOwn(
    checkpoint,
    COMPACT_DERIVATIVE_CADENCE_ARCHIVE_PROJECTION_KEY,
  )) {
    throw new TypeError(
      'Checkpoint uses a reserved codec projection key.',
    );
  }
  const archive = checkpoint.derivativeCadenceReceiptArchive;
  if (
    !archive ||
    typeof archive !== 'object' ||
    Array.isArray(archive) ||
    !Array.isArray(archive.ranges) ||
    archive.ranges.length === 0
  ) {
    return checkpoint;
  }
  const archiveKeys = Object.keys(archive);
  const shapes = [];
  const shapeIndexBySignature = new Map();
  const rows = [];
  try {
    for (const range of archive.ranges) {
      if (
        !range ||
        typeof range !== 'object' ||
        Array.isArray(range)
      ) {
        return checkpoint;
      }
      const keys = Object.keys(range);
      if (
        keys.length === 0 ||
        new Set(keys).size !== keys.length ||
        keys.some((key) => range[key] === undefined)
      ) {
        return checkpoint;
      }
      const signature = JSON.stringify(keys);
      let shapeIndex = shapeIndexBySignature.get(signature);
      if (shapeIndex === undefined) {
        shapeIndex = shapes.length;
        shapes.push(keys);
        shapeIndexBySignature.set(signature, shapeIndex);
      }
      rows.push([
        shapeIndex,
        ...keys.map((key) => range[key]),
      ]);
    }
  } catch {
    return checkpoint;
  }
  const projected = {
    ...checkpoint,
    derivativeCadenceReceiptArchive: Object.fromEntries(
      archiveKeys.map((key) => [
        key,
        key === 'ranges'
          ? { version: 1, shapes, rows }
          : archive[key],
      ]),
    ),
  };
  projected[
    COMPACT_DERIVATIVE_CADENCE_ARCHIVE_PROJECTION_KEY
  ] = {
    version: 1,
    archiveKeys,
  };
  return projected;
}

function restoreCompactDerivativeCadenceArchive(checkpoint) {
  if (!Object.hasOwn(
    checkpoint,
    COMPACT_DERIVATIVE_CADENCE_ARCHIVE_PROJECTION_KEY,
  )) {
    return checkpoint;
  }
  const projection =
    checkpoint[
      COMPACT_DERIVATIVE_CADENCE_ARCHIVE_PROJECTION_KEY
    ];
  const archive = checkpoint.derivativeCadenceReceiptArchive;
  const compact = archive?.ranges;
  if (
    !exactOrderedKeys(projection, ['version', 'archiveKeys']) ||
    projection.version !== 1 ||
    !Array.isArray(projection.archiveKeys) ||
    projection.archiveKeys.length === 0 ||
    new Set(projection.archiveKeys).size !==
      projection.archiveKeys.length ||
    !projection.archiveKeys.includes('ranges') ||
    !exactOrderedKeys(archive, projection.archiveKeys) ||
    !exactOrderedKeys(compact, ['version', 'shapes', 'rows']) ||
    compact.version !== 1 ||
    !Array.isArray(compact.shapes) ||
    compact.shapes.length === 0 ||
    !Array.isArray(compact.rows)
  ) {
    throw new Error(
      'Invalid checkpoint compact derivative cadence archive projection.',
    );
  }
  const shapes = compact.shapes.map((keys) => {
    if (
      !Array.isArray(keys) ||
      keys.length === 0 ||
      new Set(keys).size !== keys.length ||
      keys.some(
        (key) => typeof key !== 'string' || key.length === 0,
      )
    ) {
      throw new Error(
        'Invalid checkpoint compact derivative cadence shape.',
      );
    }
    return keys;
  });
  const ranges = compact.rows.map((row) => {
    const shapeIndex = row?.[0];
    const keys = shapes[shapeIndex];
    if (
      !Array.isArray(row) ||
      !Number.isSafeInteger(shapeIndex) ||
      !keys ||
      row.length !== keys.length + 1 ||
      row.some((value) => value === undefined)
    ) {
      throw new Error(
        'Invalid checkpoint compact derivative cadence row.',
      );
    }
    return Object.fromEntries(
      keys.map((key, index) => [key, row[index + 1]]),
    );
  });
  checkpoint.derivativeCadenceReceiptArchive =
    Object.fromEntries(
      projection.archiveKeys.map((key) => [
        key,
        key === 'ranges' ? ranges : archive[key],
      ]),
    );
  delete checkpoint[
    COMPACT_DERIVATIVE_CADENCE_ARCHIVE_PROJECTION_KEY
  ];
  return checkpoint;
}

function projectPackedAuditPayloads(checkpoint) {
  if (
    Object.hasOwn(
      checkpoint,
      PACKED_AUDIT_PAYLOADS_PROJECTION_KEY,
    ) ||
    !checkpoint.realtimeAuditArchive ||
    typeof checkpoint.realtimeAuditArchive !== 'object' ||
    Array.isArray(checkpoint.realtimeAuditArchive) ||
    !Array.isArray(
      checkpoint.realtimeAuditArchive.foldedBlocks,
    )
  ) {
    return { checkpoint, attachments: [] };
  }
  const foldedBlocks =
    checkpoint.realtimeAuditArchive.foldedBlocks;
  const packedIndexes = [];
  const attachments = [];
  const projectedBlocks = [...foldedBlocks];
  try {
    foldedBlocks.forEach((block, index) => {
      if (
        !block ||
        typeof block !== 'object' ||
        Array.isArray(block) ||
        block.losslessPayloadEncoding !==
          AUDIT_PAYLOAD_ENCODING ||
        typeof block.compressedLosslessPayloads !== 'string'
      ) {
        return;
      }
      const bytes = base64ToBytes(
        block.compressedLosslessPayloads,
      );
      const attachmentIndex = attachments.length;
      const checksum = checksumBytes(bytes);
      attachments.push(bytes);
      projectedBlocks[index] = {
        ...block,
        compressedLosslessPayloads: {
          encoding: PACKED_AUDIT_PAYLOAD_ENCODING,
          attachmentIndex,
          byteLength: bytes.length,
          checksum,
        },
      };
      packedIndexes.push(index);
    });
  } catch {
    return { checkpoint, attachments: [] };
  }
  if (packedIndexes.length === 0) {
    return { checkpoint, attachments: [] };
  }
  const projected = {
    ...checkpoint,
    realtimeAuditArchive: {
      ...checkpoint.realtimeAuditArchive,
      foldedBlocks: projectedBlocks,
    },
  };
  projected[PACKED_AUDIT_PAYLOADS_PROJECTION_KEY] = {
    version: 1,
    foldedBlockIndexes: packedIndexes,
    attachmentCount: attachments.length,
  };
  return { checkpoint: projected, attachments };
}

function restorePackedAuditPayloads(
  checkpoint,
  attachments = [],
) {
  if (!Object.hasOwn(
    checkpoint,
    PACKED_AUDIT_PAYLOADS_PROJECTION_KEY,
  )) {
    if (attachments.length > 0) {
      throw new Error(
        'Checkpoint contains unreferenced audit attachments.',
      );
    }
    return checkpoint;
  }
  const projection =
    checkpoint[PACKED_AUDIT_PAYLOADS_PROJECTION_KEY];
  const archive = checkpoint.realtimeAuditArchive;
  const indexes = projection?.foldedBlockIndexes;
  if (
    projection?.version !== 1 ||
    !archive ||
    typeof archive !== 'object' ||
    Array.isArray(archive) ||
    !Array.isArray(archive.foldedBlocks) ||
    !Array.isArray(indexes) ||
    indexes.length === 0 ||
    projection.attachmentCount !== indexes.length ||
    !Array.isArray(attachments) ||
    attachments.length !== projection.attachmentCount ||
    new Set(indexes).size !== indexes.length ||
    indexes.some(
      (index, position) =>
        !Number.isSafeInteger(index) ||
        index < 0 ||
        index >= archive.foldedBlocks.length ||
        (position > 0 && index <= indexes[position - 1]),
    )
  ) {
    throw new Error(
      'Invalid checkpoint packed audit projection.',
    );
  }
  const foldedBlocks = [...archive.foldedBlocks];
  indexes.forEach((index, expectedAttachmentIndex) => {
    const block = foldedBlocks[index];
    const packed = block?.compressedLosslessPayloads;
    if (
      !block ||
      typeof block !== 'object' ||
      Array.isArray(block) ||
      block.losslessPayloadEncoding !==
        AUDIT_PAYLOAD_ENCODING ||
      !packed ||
      typeof packed !== 'object' ||
      Array.isArray(packed) ||
      packed.encoding !== PACKED_AUDIT_PAYLOAD_ENCODING ||
      packed.attachmentIndex !== expectedAttachmentIndex ||
      !Number.isSafeInteger(packed.byteLength) ||
      packed.byteLength <= 0 ||
      typeof packed.checksum !== 'string' ||
      !/^[0-9a-f]{8}$/.test(packed.checksum)
    ) {
      throw new Error(
        'Invalid checkpoint packed audit payload.',
      );
    }
    const bytes = attachments[expectedAttachmentIndex];
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length !== packed.byteLength ||
      checksumBytes(bytes) !== packed.checksum
    ) {
      throw new Error(
        'Invalid checkpoint packed audit attachment.',
      );
    }
    foldedBlocks[index] = {
      ...block,
      compressedLosslessPayloads: bytesToBase64(bytes),
    };
  });
  checkpoint.realtimeAuditArchive = {
    ...archive,
    foldedBlocks,
  };
  delete checkpoint[PACKED_AUDIT_PAYLOADS_PROJECTION_KEY];
  return checkpoint;
}

function restoreCheckpointProjections(
  checkpoint,
  auditAttachments = [],
) {
  return restoreDerivedMarketMirrors(
    restoreCompactBooks(
      restoreCompactBarArchives(
        restoreCompactDerivativeCadenceArchive(
          restorePackedAuditPayloads(
            checkpoint,
            auditAttachments,
          ),
        ),
      ),
    ),
  );
}

export function encodeCheckpoint(checkpoint) {
  if (
    !checkpoint ||
    typeof checkpoint !== 'object' ||
    Array.isArray(checkpoint)
  ) {
    throw new TypeError('Checkpoint must be a JSON object.');
  }
  const projectedAudit = projectPackedAuditPayloads(
    projectCompactDerivativeCadenceArchive(
      projectCompactBarArchives(
        projectCompactBooks(
          projectDerivedMarketMirrors(checkpoint),
        ),
      ),
    ),
  );
  const projectedCheckpoint = projectedAudit.checkpoint;
  const auditAttachments = projectedAudit.attachments;
  const encoder = new TextEncoder();
  const blocks = [];
  const packedBlocks = [];
  const cachedBlocks = [];
  let jsonBytes = 0;
  let codeCount = 0;
  let binaryBytes = 0;
  let auditAttachmentsWritten = false;
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
      const chunks = [];
      const dataParts = [];
      const dictionaryResetBytes =
        dictionaryResetBytesForBlock(key);
      let blockCodeCount = 0;
      let blockDataLength = 0;
      for (
        let offset = 0;
        offset < source.length;
        offset += dictionaryResetBytes
      ) {
        const sourceChunk = source.subarray(
          offset,
          Math.min(
            source.length,
            offset + dictionaryResetBytes,
          ),
        );
        const codes = lzwEncode(sourceChunk);
        const data = codesToUtf16(codes);
        const chunk = {
          jsonBytes: sourceChunk.length,
          codeCount: codes.length,
          dataLength: data.length,
        };
        chunks.push(chunk);
        dataParts.push(data);
        blockCodeCount += codes.length;
        blockDataLength += data.length;
      }
      const compressedDataLength = blockDataLength;
      const attachments = [];
      if (
        key === 'realtimeAuditArchive' &&
        auditAttachments.length > 0
      ) {
        for (const bytes of auditAttachments) {
          const data = bytesToUtf16(bytes);
          attachments.push({
            byteLength: bytes.length,
            dataLength: data.length,
            checksum: checksumBytes(bytes),
          });
          dataParts.push(data);
          blockDataLength += data.length;
          binaryBytes += bytes.length;
        }
        auditAttachmentsWritten = true;
      }
      const block = {
        key,
        jsonBytes: source.length,
        codeCount: blockCodeCount,
        dictionaryResetBytes,
        compressedDataLength,
        dataLength: blockDataLength,
        checksum: checksumBlock(key, source),
        chunks,
      };
      if (attachments.length > 0) {
        block.attachments = attachments;
      }
      blocks.push(block);
      cachedBlocks.push({
        ...block,
        json,
      });
      packedBlocks.push(dataParts.join(''));
      codeCount += blockCodeCount;
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
    jsonBytes === 0 ||
    jsonBytes + binaryBytes > MAX_CHECKPOINT_JSON_BYTES ||
    (auditAttachments.length > 0 && !auditAttachmentsWritten)
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
    auditAttachments: auditAttachments.map((bytes) =>
      bytes.slice()),
  });
  return encoded;
}

export function decodeCheckpoint(encoded) {
  if (
    !encoded ||
    ![
      CHECKPOINT_ENCODING,
      PREVIOUS_CHUNKED_CHECKPOINT_ENCODING,
      PREVIOUS_BLOCK_CHECKPOINT_ENCODING,
      PREVIOUS_CHECKPOINT_ENCODING,
      LEGACY_CHECKPOINT_ENCODING,
    ].includes(encoded.encoding)
  ) {
    throw new Error('Unsupported checkpoint encoding.');
  }
  if (
    encoded.encoding === CHECKPOINT_ENCODING ||
    encoded.encoding === PREVIOUS_CHUNKED_CHECKPOINT_ENCODING ||
    encoded.encoding === PREVIOUS_BLOCK_CHECKPOINT_ENCODING
  ) {
    const fresh = freshCheckpointCache.get(encoded);
    freshCheckpointCache.delete(encoded);
    if (freshCacheMatches(encoded, fresh)) {
      return restoreCheckpointProjections(
        decodeFreshCheckpoint(fresh),
        fresh.auditAttachments,
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
    let totalAttachmentBytes = 0;
    const decodedAuditAttachments = [];
    const checkpoint = {};
    for (const block of encoded.blocks) {
      const expectedCompressedDataLength = Array.isArray(
        block?.chunks,
      )
        ? block.chunks.reduce(
            (sum, chunk) =>
              sum +
              (Number.isSafeInteger(chunk?.dataLength)
                ? chunk.dataLength
                : 0),
            0,
          )
        : Number.isSafeInteger(block?.codeCount)
          ? Math.ceil(
              (block.codeCount * 16) /
                UTF16_PACK_BITS,
            )
          : -1;
      const attachmentMetadata = block?.attachments;
      const hasAttachments = Array.isArray(attachmentMetadata);
      const attachmentDataLength = hasAttachments
        ? attachmentMetadata.reduce(
            (sum, attachment) =>
              sum + (Number.isSafeInteger(attachment?.dataLength)
                ? attachment.dataLength
                : 0),
            0,
          )
        : 0;
      const binaryBlockMetadataValid =
        encoded.encoding !== CHECKPOINT_ENCODING
          ? block?.dataLength === expectedCompressedDataLength
          : Number.isSafeInteger(
                block?.dictionaryResetBytes,
              ) &&
            block.dictionaryResetBytes >=
              LZW_DICTIONARY_RESET_BYTES &&
            block.dictionaryResetBytes <=
              MAX_LZW_DICTIONARY_RESET_BYTES &&
            block?.compressedDataLength ===
              expectedCompressedDataLength &&
            block?.dataLength ===
              expectedCompressedDataLength +
                attachmentDataLength &&
            (!hasAttachments ||
              (block?.key === 'realtimeAuditArchive' &&
                attachmentMetadata.length > 0 &&
                attachmentMetadata.length <=
                  MAX_CHECKPOINT_BLOCKS &&
                attachmentMetadata.every(
                  (attachment) =>
                    attachment &&
                    Number.isSafeInteger(
                      attachment.byteLength,
                    ) &&
                    attachment.byteLength > 0 &&
                    Number.isSafeInteger(
                      attachment.dataLength,
                    ) &&
                    attachment.dataLength ===
                      Math.ceil(
                        (attachment.byteLength * 8) /
                          UTF16_PACK_BITS,
                      ) &&
                    typeof attachment.checksum === 'string' &&
                    /^[0-9a-f]{8}$/.test(
                      attachment.checksum,
                    ),
                )));
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
        !binaryBlockMetadataValid ||
        typeof block.checksum !== 'string' ||
        !/^[0-9a-f]{8}$/.test(block.checksum)
      ) {
        throw new Error('Invalid compressed checkpoint block metadata.');
      }
      keys.add(block.key);
      totalJsonBytes += block.jsonBytes;
      totalCodeCount += block.codeCount;
      if (hasAttachments) {
        totalAttachmentBytes += attachmentMetadata.reduce(
          (sum, attachment) => sum + attachment.byteLength,
          0,
        );
      }
      if (
        totalJsonBytes + totalAttachmentBytes >
          MAX_CHECKPOINT_JSON_BYTES ||
        dataOffset + block.dataLength > encoded.data.length
      ) {
        throw new Error('Invalid compressed checkpoint block bounds.');
      }
      let source;
      if (
        encoded.encoding === CHECKPOINT_ENCODING ||
        encoded.encoding ===
          PREVIOUS_CHUNKED_CHECKPOINT_ENCODING
      ) {
        if (
          !Array.isArray(block.chunks) ||
          block.chunks.length === 0
        ) {
          throw new Error(
            'Invalid compressed checkpoint chunk metadata.',
          );
        }
        source = new Uint8Array(block.jsonBytes);
        let sourceOffset = 0;
        let blockDataOffset = dataOffset;
        let chunkCodeCount = 0;
        let chunkDataLength = 0;
        for (const chunk of block.chunks) {
          if (
            !chunk ||
            !Number.isSafeInteger(chunk.jsonBytes) ||
            chunk.jsonBytes <= 0 ||
            chunk.jsonBytes >
              (encoded.encoding === CHECKPOINT_ENCODING
                ? block.dictionaryResetBytes
                : LZW_DICTIONARY_RESET_BYTES) ||
            !Number.isSafeInteger(chunk.codeCount) ||
            chunk.codeCount <= 0 ||
            chunk.codeCount > chunk.jsonBytes ||
            !Number.isSafeInteger(chunk.dataLength) ||
            chunk.dataLength !==
              Math.ceil(
                chunk.codeCount * 16 /
                  UTF16_PACK_BITS,
              )
          ) {
            throw new Error(
              'Invalid compressed checkpoint chunk metadata.',
            );
          }
          const packed = encoded.data.slice(
            blockDataOffset,
            blockDataOffset + chunk.dataLength,
          );
          const codes = utf16ToCodes(
            packed,
            chunk.codeCount,
          );
          const decoded = lzwDecode(
            codes,
            chunk.jsonBytes,
          );
          source.set(decoded, sourceOffset);
          sourceOffset += chunk.jsonBytes;
          blockDataOffset += chunk.dataLength;
          chunkCodeCount += chunk.codeCount;
          chunkDataLength += chunk.dataLength;
        }
        if (
          sourceOffset !== block.jsonBytes ||
          chunkCodeCount !== block.codeCount ||
          chunkDataLength !==
            (encoded.encoding === CHECKPOINT_ENCODING
              ? block.compressedDataLength
              : block.dataLength)
        ) {
          throw new Error(
            'Invalid compressed checkpoint chunk totals.',
          );
        }
      } else {
        const packed = encoded.data.slice(
          dataOffset,
          dataOffset + block.dataLength,
        );
        const codes = utf16ToCodes(
          packed,
          block.codeCount,
        );
        source = lzwDecode(
          codes,
          block.jsonBytes,
        );
      }
      if (
        encoded.encoding === CHECKPOINT_ENCODING &&
        hasAttachments
      ) {
        let attachmentOffset =
          dataOffset + block.compressedDataLength;
        for (const attachment of attachmentMetadata) {
          const packed = encoded.data.slice(
            attachmentOffset,
            attachmentOffset + attachment.dataLength,
          );
          const bytes = utf16ToBytes(
            packed,
            attachment.byteLength,
          );
          if (checksumBytes(bytes) !== attachment.checksum) {
            throw new Error(
              'Compressed checkpoint attachment checksum does not match.',
            );
          }
          decodedAuditAttachments.push(bytes);
          attachmentOffset += attachment.dataLength;
        }
        if (attachmentOffset !== dataOffset + block.dataLength) {
          throw new Error(
            'Invalid compressed checkpoint attachment totals.',
          );
        }
      }
      dataOffset += block.dataLength;
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
    return restoreCheckpointProjections(
      checkpoint,
      decodedAuditAttachments,
    );
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
