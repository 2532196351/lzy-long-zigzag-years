import {
  deserializeWorld,
  getCompanyCatalog,
  serializeWorld,
} from './engine.js?v=f34a1d70e1a7aaed';
import {
  LEGACY_MARKET_RULE_VERSION,
  MARKET_RULE_VERSION,
  createMarketSimulation,
  migrateLegacyMarketRuleCheckpoint,
} from './market/simulator.js?v=f34a1d70e1a7aaed';
import {
  decodeCheckpoint,
  encodeCheckpoint,
} from './storage-codec.js?v=f34a1d70e1a7aaed';
import {
  collectAuditColdReferences,
  createBrowserAuditColdStore,
  exportAuditColdRecords,
  importAuditColdRecords,
} from './market/audit-cold-store.js?v=f34a1d70e1a7aaed';

export const SAVE_KEY = 'lzy.world-save.v1';
export const SAVE_META_KEY = 'lzy.world-save-meta.v1';
export const GAME_STATE_SCHEMA = 'lzy.game-state-envelope';
export const GAME_STATE_SCHEMA_VERSION = 4;
export const PORTABLE_GAME_ARCHIVE_SCHEMA =
  'lzy.portable-game-archive';
export const PORTABLE_GAME_ARCHIVE_SCHEMA_VERSION = 1;
const SUPPORTED_GAME_STATE_SCHEMA_VERSIONS = new Set([2, 3, 4]);
const CHECKPOINT_COMPRESSION_REQUEST = 'LZY_COMPRESS_CHECKPOINT';
const CHECKPOINT_COMPRESSION_RESPONSE = 'LZY_CHECKPOINT_COMPRESSED';
const COMPANY_LISTING_BY_SYMBOL = Object.freeze(
  Object.fromEntries(
    getCompanyCatalog().map((company) => [
      company.symbol,
      Object.freeze({
        issuerId: company.id,
        board: company.board,
        dailyLimitBps: company.dailyLimitBps,
      }),
    ]),
  ),
);

let checkpointCompressionWorker = null;
let checkpointCompressionRequestId = 0;
const pendingCheckpointCompression = new Map();

function synchronousCheckpointCompression(checkpoint) {
  const checkpointCodec = encodeCheckpoint(checkpoint);
  return {
    checkpointCodec,
    checkpoint: decodeCheckpoint(checkpointCodec),
  };
}

function rejectPendingCheckpointCompression(error) {
  const reason =
    error instanceof Error
      ? error
      : new Error(
          String(error ?? 'Checkpoint compression worker failed.'),
        );
  for (const pending of pendingCheckpointCompression.values()) {
    pending.reject(reason);
  }
  pendingCheckpointCompression.clear();
}

function destroyCheckpointCompressionWorker(error = null) {
  const worker = checkpointCompressionWorker;
  checkpointCompressionWorker = null;
  if (worker) {
    worker.removeEventListener?.(
      'message',
      handleCheckpointCompressionMessage,
    );
    worker.removeEventListener?.(
      'error',
      handleCheckpointCompressionError,
    );
    worker.terminate?.();
  }
  if (error) rejectPendingCheckpointCompression(error);
}

function handleCheckpointCompressionMessage(event) {
  const message = event.data;
  if (
    !message ||
    message.type !== CHECKPOINT_COMPRESSION_RESPONSE ||
    !Number.isSafeInteger(message.requestId)
  ) {
    return;
  }
  const pending = pendingCheckpointCompression.get(
    message.requestId,
  );
  if (!pending) return;
  pendingCheckpointCompression.delete(message.requestId);
  if (message.status !== 'ok') {
    pending.reject(
      new Error(
        message.error || 'Checkpoint compression worker failed.',
      ),
    );
    return;
  }
  if (
    !message.checkpointCodec ||
    typeof message.checkpointCodec !== 'object' ||
    !message.checkpoint ||
    typeof message.checkpoint !== 'object'
  ) {
    pending.reject(
      new Error('Checkpoint compression worker returned invalid data.'),
    );
    return;
  }
  pending.resolve({
    checkpointCodec: message.checkpointCodec,
    checkpoint: message.checkpoint,
  });
}

function handleCheckpointCompressionError(event) {
  const message =
    event?.message || 'Checkpoint compression worker failed.';
  destroyCheckpointCompressionWorker(new Error(message));
}

function requireCheckpointCompressionWorker() {
  if (checkpointCompressionWorker) {
    return checkpointCompressionWorker;
  }
  if (typeof globalThis.Worker !== 'function') {
    throw new Error('Checkpoint compression Worker is unavailable.');
  }
  const worker = new globalThis.Worker(
    new URL('./storage-compression-worker.js?v=f34a1d70e1a7aaed', import.meta.url),
    { type: 'module' },
  );
  worker.addEventListener(
    'message',
    handleCheckpointCompressionMessage,
  );
  worker.addEventListener(
    'error',
    handleCheckpointCompressionError,
  );
  checkpointCompressionWorker = worker;
  return worker;
}

function compressCheckpointInWorker(checkpoint) {
  let worker;
  try {
    worker = requireCheckpointCompressionWorker();
  } catch {
    return Promise.resolve().then(() =>
      synchronousCheckpointCompression(checkpoint));
  }
  checkpointCompressionRequestId += 1;
  const requestId = checkpointCompressionRequestId;
  return new Promise((resolve, reject) => {
    pendingCheckpointCompression.set(requestId, {
      resolve,
      reject,
    });
    try {
      worker.postMessage({
        type: CHECKPOINT_COMPRESSION_REQUEST,
        requestId,
        checkpoint,
      });
    } catch (error) {
      pendingCheckpointCompression.delete(requestId);
      reject(error);
    }
  }).catch((error) => {
    // A failed module Worker must not make a confirmed SAVE_BARRIER
    // unsavable. The deterministic synchronous codec is the fallback.
    destroyCheckpointCompressionWorker();
    return synchronousCheckpointCompression(checkpoint);
  });
}

function requireStorage() {
  if (!globalThis.localStorage) {
    throw new Error('当前浏览器不允许使用本地存储。');
  }
  return globalThis.localStorage;
}

function jsonClone(value, label) {
  try {
    const encoded = JSON.stringify(value);
    if (encoded === undefined) {
      throw new TypeError(`${label} is not JSON serializable.`);
    }
    return JSON.parse(encoded);
  } catch (error) {
    throw new TypeError(
      `${label} must be a complete JSON-serializable value: ${error.message}`,
    );
  }
}

function parseJson(raw, label) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid ${label} JSON: ${error.message}`);
  }
}

function isEnvelopeCandidate(value) {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (
        Object.hasOwn(value, 'schema') ||
        Object.hasOwn(value, 'schemaVersion') ||
        Object.hasOwn(value, 'checkpoint')
      ),
  );
}

function normalizedWorldInput(world) {
  if (
    world &&
    typeof world === 'object' &&
    Object.hasOwn(world, 'state')
  ) {
    return {
      state: world.state,
      commitSeq: world.commitSeq,
    };
  }
  return {
    state: world,
    commitSeq: undefined,
  };
}

function assertSafeCommitSeq(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Save commit sequence must be a non-negative integer.');
  }
}

function assertSameJson(left, right, message) {
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    throw new Error(message);
  }
}

function isPositiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function compareAuthoritativeSequence(left, right) {
  const leftCommit = Number.isSafeInteger(left.commitSeq)
    ? left.commitSeq
    : -1;
  const rightCommit = Number.isSafeInteger(right.commitSeq)
    ? right.commitSeq
    : -1;
  if (leftCommit !== rightCommit) return rightCommit - leftCommit;
  return String(right.sequenceId ?? '').localeCompare(
    String(left.sequenceId ?? ''),
  );
}

function latestCandidate(candidates) {
  return [...candidates].sort(
    (left, right) =>
      right.atMs - left.atMs ||
      compareAuthoritativeSequence(left, right),
  )[0] ?? null;
}

function genesisCandidate(security) {
  const genesisEntries = (security.priceHistory ?? [])
    .filter(
      (entry) =>
        entry?.tick === 0 &&
        entry.virtualMs === undefined,
    )
    .map((entry, index) => {
      const direct = isPositiveInteger(entry.priceTicks)
        ? entry.priceTicks
        : Number.isFinite(Number(entry.price)) &&
            Number(entry.price) > 0
          ? Math.round(Number(entry.price) * 100)
          : null;
      return isPositiveInteger(direct)
        ? {
            source: 'genesis',
            atMs: 0,
            priceTicks: direct,
            commitSeq: entry.commitSeq,
            sequenceId: entry.tradeId ?? `genesis-${index}`,
          }
        : null;
    })
    .filter(Boolean);
  if (genesisEntries.length === 0) return null;
  if (
    new Set(genesisEntries.map((entry) => entry.priceTicks)).size > 1
  ) {
    return { conflict: true };
  }
  return latestCandidate(genesisEntries);
}

function legacyMatchedCloseCandidate(security) {
  return latestCandidate(
    (security.priceHistory ?? [])
      .filter(
        (entry) =>
          entry?.source === 'matched_npc_orders' &&
          Number.isSafeInteger(entry.tick) &&
          entry.tick > 0 &&
          typeof entry.tradeId === 'string' &&
          entry.tradeId.length > 0,
      )
      .map((entry, index) => {
        const priceTicks = isPositiveInteger(
          entry.priceTicks,
        )
          ? entry.priceTicks
          : Number.isFinite(Number(entry.price)) &&
              Number(entry.price) > 0
            ? Math.round(Number(entry.price) * 100)
            : null;
        return isPositiveInteger(priceTicks)
          ? {
              source: 'matched_npc_orders',
              atMs: entry.tick,
              priceTicks,
              commitSeq: entry.commitSeq,
              sequenceId:
                entry.tradeId ??
                `legacy-match-${String(index).padStart(8, '0')}`,
            }
          : null;
      })
      .filter(Boolean),
  );
}

function reconstructPreviousClose(checkpoint, symbol, security) {
  const settlementMs = Number.isSafeInteger(
    checkpoint.lastWorldDaySettlementMs,
  )
    ? checkpoint.lastWorldDaySettlementMs
    : 0;
  if (settlementMs < 0) return null;

  const synthetic = latestCandidate(
    (security.priceHistory ?? [])
    .filter(
      (entry) =>
        entry?.source === 'synthetic_daily_close' &&
        isPositiveInteger(entry.priceTicks) &&
        Number.isSafeInteger(entry.virtualMs) &&
        entry.virtualMs === settlementMs,
    )
      .map((entry, index) => ({
        source: 'synthetic_daily_close',
        atMs: entry.virtualMs,
        priceTicks: entry.priceTicks,
        commitSeq: entry.commitSeq,
        sequenceId: `synthetic-${index}`,
      })),
  );

  const daily = latestCandidate(
    (
      checkpoint.barArchives?.bySymbol?.[symbol]?.dailyBars ?? []
    )
      .filter(
        (bar) =>
          isPositiveInteger(bar?.closeTicks) &&
          Number.isSafeInteger(bar?.endMs) &&
          bar.endMs <= settlementMs,
      )
      .map((bar, index) => ({
        source: 'archived_daily_bar',
        atMs: bar.endMs,
        priceTicks: bar.closeTicks,
        commitSeq: bar.commitSeq,
        sequenceId: `daily-${String(index).padStart(8, '0')}`,
      })),
  );

  const realtime = latestCandidate(
    (security.priceHistory ?? [])
      .filter(
        (entry) =>
          settlementMs > 0 &&
          entry?.source === 'realtime_order_book' &&
          isPositiveInteger(entry.priceTicks) &&
          Number.isSafeInteger(entry.virtualMs) &&
          entry.virtualMs <= settlementMs,
      )
      .map((entry, index) => ({
        source: 'realtime_order_book',
        atMs: entry.virtualMs,
        priceTicks: entry.priceTicks,
        commitSeq: entry.commitSeq,
        sequenceId:
          entry.tradeId ?? `realtime-${String(index).padStart(8, '0')}`,
      })),
  );
  // A world can accrue settled finite NPC matches before the realtime market
  // controller is first materialized.  That controller starts at virtual ms
  // zero, but the exchange reference must remain the latest matched close,
  // not fall back to the older genesis print.
  const legacyMatched =
    settlementMs === 0
      ? legacyMatchedCloseCandidate(security)
      : null;
  const genesis = genesisCandidate(security);
  if (genesis?.conflict) {
    throw new Error(`CONFLICTING_PREVIOUS_CLOSE:${symbol}`);
  }

  const available = [
    synthetic,
    daily,
    realtime,
    legacyMatched,
    genesis,
  ].filter(Boolean);
  for (let leftIndex = 0; leftIndex < available.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < available.length;
      rightIndex += 1
    ) {
      const left = available[leftIndex];
      const right = available[rightIndex];
      if (
        left.atMs === right.atMs &&
        left.priceTicks !== right.priceTicks
      ) {
        throw new Error(`CONFLICTING_PREVIOUS_CLOSE:${symbol}`);
      }
    }
  }

  return (
    synthetic ??
    daily ??
    realtime ??
    legacyMatched ??
    genesis ??
    null
  );
}

function hasMatchingRuleActivation(
  checkpoint,
  symbol,
  previousCloseTicks,
  security,
) {
  const settlementMs = Number.isSafeInteger(
    checkpoint.lastWorldDaySettlementMs,
  )
    ? checkpoint.lastWorldDaySettlementMs
    : 0;
  const settlementBoundary = latestCandidate([
    ...(checkpoint.receipts ?? [])
      .filter(
        (receipt) =>
          receipt?.type === 'world_advanced' &&
          receipt.status === 'accepted' &&
          receipt.virtualMs === settlementMs &&
          Number.isSafeInteger(receipt.commitSeq) &&
          receipt.commitSeq >= 0 &&
          receipt.commitSeq <= checkpoint.commitSeq,
      )
      .map((receipt) => ({
        source: 'world_advanced',
        atMs: receipt.virtualMs,
        commitSeq: receipt.commitSeq,
        sequenceId: receipt.id,
      })),
    ...(security.priceHistory ?? [])
      .filter(
        (entry) =>
          entry?.source === 'synthetic_daily_close' &&
          entry.virtualMs === settlementMs &&
          Number.isSafeInteger(entry.commitSeq) &&
          entry.commitSeq >= 0 &&
          entry.commitSeq <= checkpoint.commitSeq,
      )
      .map((entry, index) => ({
        source: 'synthetic_daily_close',
        atMs: entry.virtualMs,
        commitSeq: entry.commitSeq,
        sequenceId: `synthetic-${symbol}-${index}`,
      })),
  ]);
  return (checkpoint.receipts ?? []).some((receipt) => {
    const activation = receipt?.listingActivations?.[symbol];
    const followsSettlement = settlementBoundary
      ? (
          receipt.virtualMs > settlementBoundary.atMs ||
          (
            receipt.virtualMs === settlementBoundary.atMs &&
            receipt.commitSeq > settlementBoundary.commitSeq
          )
        )
      : receipt.virtualMs >= settlementMs;
    return Boolean(
      receipt?.type === 'market_rule_migration' &&
        receipt.status === 'applied' &&
        receipt.fromVersion === LEGACY_MARKET_RULE_VERSION &&
        receipt.toVersion === MARKET_RULE_VERSION &&
        Number.isSafeInteger(receipt.virtualMs) &&
        Number.isSafeInteger(receipt.commitSeq) &&
        receipt.commitSeq >= 0 &&
        receipt.commitSeq <= checkpoint.commitSeq &&
        followsSettlement &&
        activation?.anchorSource ===
          'rule_activation_last_price' &&
        activation.previousCloseTicks === previousCloseTicks &&
        activation.lastPriceTicks === previousCloseTicks &&
        activation.board === security.board &&
        activation.dailyLimitBps === security.dailyLimitBps,
    );
  });
}

function migrateLegacyListingFields(loaded) {
  if (!loaded.checkpoint) return loaded;
  const checkpoint = jsonClone(
    loaded.checkpoint,
    'legacy market checkpoint',
  );
  const securities = checkpoint.world?.market?.securities;
  if (!securities || typeof securities !== 'object') {
    throw new Error('Invalid legacy realtime market securities.');
  }

  const migratedFields = [];
  for (const [symbol, security] of Object.entries(securities)) {
    const canonical = COMPANY_LISTING_BY_SYMBOL[symbol];
    if (!canonical || security?.issuerId !== canonical.issuerId) {
      throw new Error(`UNSUPPORTED_LISTING_IDENTITY:${symbol}`);
    }
    if (
      Object.hasOwn(security, 'board') &&
      security.board !== canonical.board
    ) {
      throw new Error(`INVALID_LISTING_RULE:${symbol}`);
    }
    if (
      Object.hasOwn(security, 'dailyLimitBps') &&
      security.dailyLimitBps !== canonical.dailyLimitBps
    ) {
      throw new Error(`INVALID_LISTING_RULE:${symbol}`);
    }
    const reconstructed = reconstructPreviousClose(
      checkpoint,
      symbol,
      security,
    );
    if (
      Object.hasOwn(security, 'previousCloseTicks') &&
      !isPositiveInteger(security.previousCloseTicks)
    ) {
      throw new Error(`MISSING_PREVIOUS_CLOSE:${symbol}`);
    }
    if (!reconstructed || !isPositiveInteger(reconstructed.priceTicks)) {
      throw new Error(`UNRECOVERABLE_PREVIOUS_CLOSE:${symbol}`);
    }
    if (
      Object.hasOwn(security, 'previousCloseTicks') &&
      security.previousCloseTicks !== reconstructed.priceTicks &&
      !hasMatchingRuleActivation(
        checkpoint,
        symbol,
        security.previousCloseTicks,
        security,
      )
    ) {
      throw new Error(`INVALID_PREVIOUS_CLOSE:${symbol}`);
    }

    if (!Object.hasOwn(security, 'board')) {
      security.board = canonical.board;
      migratedFields.push(`${symbol}.board`);
    }
    if (!Object.hasOwn(security, 'dailyLimitBps')) {
      security.dailyLimitBps = canonical.dailyLimitBps;
      migratedFields.push(`${symbol}.dailyLimitBps`);
    }
    if (!Object.hasOwn(security, 'previousCloseTicks')) {
      security.previousCloseTicks = reconstructed.priceTicks;
      migratedFields.push(`${symbol}.previousCloseTicks`);
    }
  }

  if (migratedFields.length === 0) return loaded;
  const migratedWorld = deserializeWorld(
    JSON.stringify(checkpoint.world),
  );
  return {
    ...loaded,
    world: migratedWorld,
    checkpoint,
    migration: {
      type: 'listing-fields-v2',
      fields: migratedFields,
      source:
        'settlement-close-daily-bars-realtime-history-genesis-and-listing-contract',
      persisted: false,
    },
  };
}

function validateGameStateParts({
  world,
  checkpoint,
  commitSeq,
  wrapperCommitSeq,
  marketRuleVersion,
  allowLegacyMarketRule = false,
}) {
  if (!world || typeof world !== 'object') {
    throw new Error('Save requires an authoritative world.');
  }
  if (!checkpoint || typeof checkpoint !== 'object') {
    throw new Error('Save requires a canonical market checkpoint.');
  }
  const rawWorldId = world.world?.id;
  const rawCheckpointWorldId = checkpoint.world?.world?.id;
  if (
    typeof rawWorldId !== 'string' ||
    rawWorldId.length === 0 ||
    rawCheckpointWorldId !== rawWorldId
  ) {
    throw new Error(
      'Save world identity does not match the market checkpoint.',
    );
  }

  let validatedWorld;
  let checkpointWorld;
  const sharesAuthoritativeWorld = world === checkpoint.world;
  try {
    validatedWorld = deserializeWorld(JSON.stringify(world));
  } catch (error) {
    throw new Error(
      `Invalid authoritative world: ${error.message}`,
      { cause: error },
    );
  }
  if (sharesAuthoritativeWorld) {
    checkpointWorld = validatedWorld;
  } else {
    try {
      checkpointWorld = deserializeWorld(
        JSON.stringify(checkpoint.world),
      );
    } catch (error) {
      throw new Error(
        `Invalid canonical market checkpoint: ${error.message}`,
        { cause: error },
      );
    }
  }
  const worldId = validatedWorld.world.id;

  if (
    !worldId ||
    checkpointWorld.world.id !== worldId
  ) {
    throw new Error(
      'Save world identity does not match the market checkpoint.',
    );
  }

  assertSafeCommitSeq(commitSeq);
  if (checkpoint.commitSeq !== commitSeq) {
    throw new Error(
      'Save commit sequence does not match the market checkpoint.',
    );
  }
  if (
    wrapperCommitSeq !== undefined &&
    wrapperCommitSeq !== commitSeq
  ) {
    throw new Error(
      'Save commit sequence does not match the authoritative world wrapper.',
    );
  }
  if (
    Object.hasOwn(validatedWorld, 'commitSeq') &&
    validatedWorld.commitSeq !== commitSeq
  ) {
    throw new Error(
      'Save commit sequence does not match the authoritative world.',
    );
  }

  if (
    typeof checkpoint.marketRuleVersion !== 'string' ||
    checkpoint.marketRuleVersion.length === 0 ||
    (
      marketRuleVersion !== undefined &&
      checkpoint.marketRuleVersion !== marketRuleVersion
    )
  ) {
    throw new Error(
      'Save market schema does not match the market checkpoint.',
    );
  }
  if (
    checkpoint.marketRuleVersion !== MARKET_RULE_VERSION &&
    !(
      allowLegacyMarketRule &&
      checkpoint.marketRuleVersion ===
        LEGACY_MARKET_RULE_VERSION
    )
  ) {
    throw new Error(
      'Save uses an incompatible market schema.',
    );
  }

  if (!sharesAuthoritativeWorld) {
    assertSameJson(
      validatedWorld,
      checkpointWorld,
      'Save authoritative world does not match the checkpoint world.',
    );
  }

  return {
    world: validatedWorld,
    checkpoint,
    worldId,
    marketRuleVersion: checkpoint.marketRuleVersion,
  };
}

function makeMetadata(world, {
  supplied = {},
  savedAt,
  reason,
  commitSeq,
  marketRuleVersion,
}) {
  return {
    ...supplied,
    version: GAME_STATE_SCHEMA_VERSION,
    schema: GAME_STATE_SCHEMA,
    worldId: world.world.id,
    worldName: world.world.name,
    seed: world.world.seed,
    tick: world.world.tick,
    year: world.world.calendar.year,
    day: world.world.calendar.day,
    roleLabel: world.player.roleLabel,
    profileName: world.player.profileName,
    savedAt,
    reason,
    commitSeq,
    marketRuleVersion,
  };
}

function assertEnvelopeSchema(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    value.schema !== GAME_STATE_SCHEMA ||
    !SUPPORTED_GAME_STATE_SCHEMA_VERSIONS.has(value.schemaVersion)
  ) {
    throw new Error('Invalid or incompatible game-state envelope schema.');
  }
}

function validateEnvelopeHeaders(value, checkpoint) {
  assertEnvelopeSchema(value);
  const storedWorld =
    value.schemaVersion >= 3
      ? checkpoint?.world
      : value.world;
  if (!value.metadata || typeof value.metadata !== 'object') {
    throw new Error('Invalid game-state envelope metadata.');
  }
  if (
    typeof value.savedAt !== 'string' ||
    value.savedAt.length === 0 ||
    value.worldId !== storedWorld?.world?.id ||
    value.metadata.worldId !== value.worldId
  ) {
    throw new Error(
      'Game-state envelope world identity does not match its metadata.',
    );
  }
  if (
    value.metadata.commitSeq !== value.commitSeq ||
    value.metadata.marketRuleVersion !== value.marketRuleVersion
  ) {
    throw new Error(
      'Game-state envelope commit sequence or market schema metadata does not match.',
    );
  }
  if (
    checkpoint?.commitSeq !== value.commitSeq ||
    checkpoint?.marketRuleVersion !== value.marketRuleVersion
  ) {
    throw new Error(
      'Game-state envelope commit sequence or market schema does not match its checkpoint.',
    );
  }
  if (
    checkpoint.marketRuleVersion !== MARKET_RULE_VERSION &&
    checkpoint.marketRuleVersion !== LEGACY_MARKET_RULE_VERSION
  ) {
    throw new Error('Save uses an incompatible market schema.');
  }
  if (
    Object.hasOwn(storedWorld, 'commitSeq') &&
    storedWorld.commitSeq !== value.commitSeq
  ) {
    throw new Error(
      'Save commit sequence does not match the authoritative world.',
    );
  }
  if (
    value.metadata.schema !== GAME_STATE_SCHEMA ||
    value.metadata.version !== value.schemaVersion
  ) {
    throw new Error('Game-state envelope metadata schema does not match.');
  }
  if (
    value.metadata.savedAt !== value.savedAt ||
    storedWorld?.ui?.savedAt !== value.savedAt ||
    checkpoint?.world?.ui?.savedAt !== value.savedAt
  ) {
    throw new Error('Game-state envelope savedAt metadata does not match.');
  }
  if (
    value.worldRuleVersion !== storedWorld?.world?.ruleVersion
  ) {
    throw new Error('Game-state envelope world schema does not match.');
  }
  return storedWorld;
}

function validateEnvelope(value) {
  assertEnvelopeSchema(value);
  let checkpoint;
  if (value?.schemaVersion >= 4) {
    try {
      checkpoint = decodeCheckpoint(value.checkpointCodec);
    } catch (error) {
      throw new Error(
        `Invalid compressed market checkpoint: ${error.message}`,
        { cause: error },
      );
    }
  } else {
    checkpoint = value?.checkpoint;
  }
  const storedWorld = validateEnvelopeHeaders(value, checkpoint);

  const validated = validateGameStateParts({
    world: storedWorld,
    checkpoint,
    commitSeq: value.commitSeq,
    wrapperCommitSeq: undefined,
    marketRuleVersion: value.marketRuleVersion,
    allowLegacyMarketRule: true,
  });

  return {
    world: validated.world,
    checkpoint: validated.checkpoint,
    metadata: value.metadata,
  };
}

function parseStoredGameState(raw) {
  const parsed = parseJson(raw, 'LZY save');
  if (!isEnvelopeCandidate(parsed)) {
    return {
      world: deserializeWorld(raw),
      checkpoint: null,
      metadata: null,
      legacy: true,
    };
  }
  const listingMigrated = migrateLegacyListingFields({
    ...validateEnvelope(parsed),
    legacy: false,
  });
  if (
    listingMigrated.checkpoint?.marketRuleVersion !==
      LEGACY_MARKET_RULE_VERSION
  ) {
    return listingMigrated;
  }
  const checkpoint = migrateLegacyMarketRuleCheckpoint(
    listingMigrated.world,
    listingMigrated.checkpoint,
  );
  return {
    ...listingMigrated,
    world: deserializeWorld(JSON.stringify(checkpoint.world)),
    checkpoint,
    metadata: listingMigrated.metadata
      ? {
          ...listingMigrated.metadata,
          commitSeq: checkpoint.commitSeq,
          marketRuleVersion: checkpoint.marketRuleVersion,
        }
      : null,
    migration: {
      type: 'market-rule-activation-v1',
      fromVersion: LEGACY_MARKET_RULE_VERSION,
      toVersion: MARKET_RULE_VERSION,
      persisted: false,
      ...(listingMigrated.migration
        ? {
            listingFieldMigration: jsonClone(
              listingMigrated.migration,
              'listing field migration',
            ),
          }
        : {}),
    },
  };
}

export function getSaveMeta() {
  try {
    const storage = requireStorage();
    const saveRaw = storage.getItem(SAVE_KEY);
    if (saveRaw) {
      const parsed = parseJson(saveRaw, 'LZY save');
      if (isEnvelopeCandidate(parsed)) {
        return parseStoredGameState(saveRaw).metadata;
      }
    }
    const raw = storage.getItem(SAVE_META_KEY);
    return raw ? parseJson(raw, 'legacy save metadata') : null;
  } catch {
    return null;
  }
}

export function hasSavedWorld() {
  try {
    const raw = requireStorage().getItem(SAVE_KEY);
    if (!raw) return false;
    const loaded = parseStoredGameState(raw);
    if (
      loaded.checkpoint &&
      collectAuditColdReferences(loaded.checkpoint).length === 0
    ) {
      createMarketSimulation(loaded.world, loaded.checkpoint);
    }
    return true;
  } catch {
    return false;
  }
}

export function saveWorld(state, reason = 'manual') {
  const storage = requireStorage();
  const savedAt = new Date().toISOString();
  const next = deserializeWorld(serializeWorld(state));
  next.ui = {
    ...next.ui,
    savedAt,
  };
  const payload = serializeWorld(next);
  const meta = {
    version: 1,
    worldId: next.world.id,
    worldName: next.world.name,
    seed: next.world.seed,
    tick: next.world.tick,
    year: next.world.calendar.year,
    day: next.world.calendar.day,
    roleLabel: next.player.roleLabel,
    profileName: next.player.profileName,
    savedAt,
    reason,
  };

  storage.setItem(SAVE_KEY, payload);
  storage.setItem(SAVE_META_KEY, JSON.stringify(meta));
  return next;
}

function prepareGameStateSave(gameState, reason) {
  if (!gameState || typeof gameState !== 'object') {
    throw new TypeError('saveGameState requires a game-state snapshot.');
  }

  const normalizedWorld = normalizedWorldInput(gameState.world);
  const checkpoint = gameState.checkpoint;
  const commitSeq =
    gameState.commitSeq ?? checkpoint?.commitSeq;
  const validated = validateGameStateParts({
    world: normalizedWorld.state,
    checkpoint,
    commitSeq,
    wrapperCommitSeq: normalizedWorld.commitSeq,
    marketRuleVersion: checkpoint?.marketRuleVersion,
  });
  const suppliedMetadata =
    gameState.metadata &&
    typeof gameState.metadata === 'object'
      ? jsonClone(gameState.metadata, 'save metadata')
      : {};
  const savedAt = new Date().toISOString();
  const savedWorld = validated.world;
  savedWorld.ui = {
    ...savedWorld.ui,
    savedAt,
  };
  const savedCheckpoint = {
    ...validated.checkpoint,
    world: savedWorld,
  };
  const savedReason =
    suppliedMetadata.reason ?? gameState.reason ?? reason;
  const metadata = makeMetadata(savedWorld, {
    supplied: suppliedMetadata,
    savedAt,
    reason: savedReason,
    commitSeq,
    marketRuleVersion: validated.marketRuleVersion,
  });
  return {
    commitSeq,
    marketRuleVersion: validated.marketRuleVersion,
    metadata,
    savedAt,
    savedCheckpoint,
    savedWorld,
    worldId: validated.worldId,
  };
}

function persistPreparedGameState(
  prepared,
  {
    checkpointCodec,
    checkpoint: persistedCheckpoint,
  },
) {
  if (
    !checkpointCodec ||
    typeof checkpointCodec !== 'object' ||
    !persistedCheckpoint ||
    typeof persistedCheckpoint !== 'object'
  ) {
    throw new Error('Checkpoint compression returned invalid data.');
  }
  const envelope = {
    schema: GAME_STATE_SCHEMA,
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    worldRuleVersion: prepared.savedWorld.world.ruleVersion,
    marketRuleVersion: prepared.marketRuleVersion,
    worldId: prepared.worldId,
    commitSeq: prepared.commitSeq,
    savedAt: prepared.savedAt,
    metadata: prepared.metadata,
    checkpointCodec,
  };

  const payload = JSON.stringify(envelope);
  validateEnvelopeHeaders(envelope, persistedCheckpoint);
  requireStorage().setItem(SAVE_KEY, payload);
  return {
    world: prepared.savedWorld,
    checkpoint: persistedCheckpoint,
  };
}

/**
 * Persists one SAVE_KEY write containing a worker SAVE_BARRIER world,
 * canonical market checkpoint and metadata. The accepted input is the
 * SAVE_BARRIER shape:
 *   { world: { state, commitSeq } | state, checkpoint, commitSeq, metadata }
 */
export function saveGameState(gameState, reason = 'manual') {
  const prepared = prepareGameStateSave(gameState, reason);
  return persistPreparedGameState(
    prepared,
    synchronousCheckpointCompression(prepared.savedCheckpoint),
  );
}

/**
 * Performs the expensive checkpoint compression and self-decode in a
 * dedicated module Worker when available. Only the final verified envelope
 * write runs on the UI thread. The optional compressor is a deterministic
 * test seam and must return the same shape as the built-in worker.
 */
export async function saveGameStateAsync(
  gameState,
  reason = 'manual',
  {
    compressCheckpoint = compressCheckpointInWorker,
  } = {},
) {
  if (typeof compressCheckpoint !== 'function') {
    throw new TypeError(
      'saveGameStateAsync requires a checkpoint compressor.',
    );
  }
  const prepared = prepareGameStateSave(gameState, reason);
  const compressed = await compressCheckpoint(
    prepared.savedCheckpoint,
  );
  return persistPreparedGameState(prepared, compressed);
}

export function loadGameState() {
  const raw = requireStorage().getItem(SAVE_KEY);
  if (!raw) return null;
  const loaded = parseStoredGameState(raw);
  return {
    world: loaded.world,
    checkpoint: loaded.checkpoint ?? null,
    ...(loaded.migration
      ? { migration: loaded.migration }
      : {}),
  };
}

export function loadWorld() {
  return loadGameState()?.world ?? null;
}

export async function exportSavedGameArchive({
  auditColdStore = createBrowserAuditColdStore(),
} = {}) {
  const raw = requireStorage().getItem(SAVE_KEY);
  if (!raw) throw new Error('No local LZY save is available.');
  const loaded = parseStoredGameState(raw);
  const auditColdRecords = loaded.checkpoint
    ? await exportAuditColdRecords(
        loaded.checkpoint,
        auditColdStore,
      )
    : [];
  return JSON.stringify({
    schema: PORTABLE_GAME_ARCHIVE_SCHEMA,
    schemaVersion: PORTABLE_GAME_ARCHIVE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    worldId: loaded.world.world.id,
    saveEnvelope: raw,
    auditColdRecords,
  });
}

export async function importSavedGameArchive(
  archiveText,
  {
    auditColdStore = createBrowserAuditColdStore(),
  } = {},
) {
  const archive = parseJson(
    String(archiveText ?? ''),
    'portable LZY save archive',
  );
  if (
    !archive ||
    typeof archive !== 'object' ||
    archive.schema !== PORTABLE_GAME_ARCHIVE_SCHEMA ||
    archive.schemaVersion !==
      PORTABLE_GAME_ARCHIVE_SCHEMA_VERSION ||
    typeof archive.exportedAt !== 'string' ||
    archive.exportedAt.length === 0 ||
    typeof archive.worldId !== 'string' ||
    archive.worldId.length === 0 ||
    typeof archive.saveEnvelope !== 'string' ||
    !Array.isArray(archive.auditColdRecords)
  ) {
    throw new Error('Invalid or incompatible portable LZY save archive.');
  }
  const loaded = parseStoredGameState(archive.saveEnvelope);
  if (loaded.world.world.id !== archive.worldId) {
    throw new Error(
      'Portable save archive world identity does not match.',
    );
  }
  if (loaded.checkpoint) {
    await importAuditColdRecords(
      loaded.checkpoint,
      archive.auditColdRecords,
      auditColdStore,
    );
  } else if (archive.auditColdRecords.length > 0) {
    throw new Error(
      'Legacy portable save cannot contain realtime-audit cold records.',
    );
  }
  const storage = requireStorage();
  storage.setItem(SAVE_KEY, archive.saveEnvelope);
  storage.removeItem(SAVE_META_KEY);
  return {
    world: loaded.world,
    checkpoint: loaded.checkpoint ?? null,
    ...(loaded.migration
      ? { migration: loaded.migration }
      : {}),
  };
}

export function hasStoredSaveArchive() {
  try {
    return Boolean(requireStorage().getItem(SAVE_KEY));
  } catch {
    return false;
  }
}

export function clearSavedWorld() {
  const storage = requireStorage();
  storage.removeItem(SAVE_KEY);
  storage.removeItem(SAVE_META_KEY);
}
