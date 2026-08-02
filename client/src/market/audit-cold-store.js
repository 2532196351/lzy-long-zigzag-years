const COLD_RECORD_SCHEMA =
  'lzy_realtime_audit_cold_record_v1';
const COLD_TRANSPORT_SCHEMA =
  'lzy_realtime_audit_cold_transport_v1';
const DATABASE_NAME = 'lzy-realtime-audit-cold-v1';
const STORE_NAME = 'records';

function hashText(input) {
  let hash = 2166136261;
  for (const character of String(input)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function validKind(kind) {
  return kind === 'payload' || kind === 'block';
}

export function validAuditColdReference(reference) {
  return Boolean(
    reference?.schema === COLD_RECORD_SCHEMA &&
      validKind(reference.kind) &&
      typeof reference.key === 'string' &&
      reference.key.length > 0 &&
      typeof reference.digest === 'string' &&
      /^[0-9a-f]{8}$/.test(reference.digest) &&
      Number.isSafeInteger(reference.encodedCharacters) &&
      reference.encodedCharacters > 0,
  );
}

function validatedRecord(record) {
  if (
    !validAuditColdReference(record) ||
    typeof record.value !== 'string' ||
    record.value.length !== record.encodedCharacters ||
    hashText(record.value) !== record.digest
  ) {
    throw new Error('Invalid realtime-audit cold record.');
  }
  return {
    schema: record.schema,
    kind: record.kind,
    key: record.key,
    digest: record.digest,
    encodedCharacters: record.encodedCharacters,
    value: record.value,
  };
}

function referenceFromRecord(record) {
  return {
    schema: record.schema,
    kind: record.kind,
    key: record.key,
    digest: record.digest,
    encodedCharacters: record.encodedCharacters,
  };
}

function sameReference(reference, record) {
  return Boolean(
    reference.schema === record.schema &&
      reference.kind === record.kind &&
      reference.key === record.key &&
      reference.digest === record.digest &&
      reference.encodedCharacters ===
        record.encodedCharacters,
  );
}

function assertAcyclicColdGraph(rootReferences, edgesByKey) {
  const visited = new Set();
  const active = new Set();
  const visit = (key) => {
    if (active.has(key)) {
      throw new Error(
        `Cyclic realtime-audit cold graph: ${key}`,
      );
    }
    if (visited.has(key)) return;
    active.add(key);
    for (const childKey of edgesByKey.get(key) ?? []) {
      visit(childKey);
    }
    active.delete(key);
    visited.add(key);
  };
  for (const reference of rootReferences) visit(reference.key);
  return visited;
}

function parsedColdBlock(record) {
  if (record.kind !== 'block') return null;
  let block;
  try {
    block = JSON.parse(record.value);
  } catch {
    throw new Error(
      `Invalid realtime-audit cold block: ${record.key}`,
    );
  }
  if (!block || typeof block !== 'object') {
    throw new Error(
      `Invalid realtime-audit cold block: ${record.key}`,
    );
  }
  return block;
}

export function collectAuditColdReferences(value) {
  const byKey = new Map();
  const pending = [value];
  const visited = new Set();
  while (pending.length > 0) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);
    if (validAuditColdReference(current)) {
      const prior = byKey.get(current.key);
      if (prior && !sameReference(prior, current)) {
        throw new Error(
          'Conflicting realtime-audit cold references.',
        );
      }
      byKey.set(current.key, referenceFromRecord(current));
      continue;
    }
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    pending.push(...Object.values(current));
  }
  return [...byKey.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

export async function exportAuditColdRecords(
  checkpoint,
  auditColdStore,
) {
  const rootReferences = collectAuditColdReferences(checkpoint);
  if (rootReferences.length === 0) return [];
  if (!auditColdStore || typeof auditColdStore.get !== 'function') {
    throw new Error(
      'Realtime-audit cold storage is unavailable for portable export.',
    );
  }
  const referencesByKey = new Map(
    rootReferences.map((reference) => [reference.key, reference]),
  );
  const recordsByKey = new Map();
  const edgesByKey = new Map();
  const queue = [...rootReferences];
  while (queue.length > 0) {
    const reference = queue.shift();
    if (recordsByKey.has(reference.key)) continue;
    const value = await auditColdStore.get(reference);
    const record = validatedRecord({ ...reference, value });
    recordsByKey.set(record.key, record);
    const block = parsedColdBlock(record);
    const childReferences = block
      ? collectAuditColdReferences(block)
      : [];
    edgesByKey.set(
      record.key,
      childReferences.map((child) => child.key),
    );
    for (const child of childReferences) {
      const prior = referencesByKey.get(child.key);
      if (prior && !sameReference(prior, child)) {
        throw new Error(
          'Conflicting realtime-audit cold references.',
        );
      }
      if (!prior) referencesByKey.set(child.key, child);
      queue.push(child);
    }
  }
  assertAcyclicColdGraph(rootReferences, edgesByKey);
  return [...recordsByKey.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
}

export async function importAuditColdRecords(
  checkpoint,
  records,
  auditColdStore,
) {
  if (!Array.isArray(records)) {
    throw new Error('Invalid realtime-audit cold archive records.');
  }
  const rootReferences = collectAuditColdReferences(checkpoint);
  if (rootReferences.length === 0) {
    if (records.length !== 0) {
      throw new Error(
        'Realtime-audit cold archive contains unreachable records.',
      );
    }
    return [];
  }
  if (!auditColdStore || typeof auditColdStore.put !== 'function') {
    throw new Error(
      'Realtime-audit cold storage is unavailable for portable import.',
    );
  }
  const recordsByKey = new Map();
  for (const candidate of records) {
    const record = validatedRecord(candidate);
    const prior = recordsByKey.get(record.key);
    if (prior && !sameReference(prior, record)) {
      throw new Error(
        'Conflicting realtime-audit cold archive records.',
      );
    }
    if (prior && prior.value !== record.value) {
      throw new Error(
        'Conflicting realtime-audit cold archive payloads.',
      );
    }
    recordsByKey.set(record.key, record);
  }
  if (recordsByKey.size !== records.length) {
    throw new Error(
      'Realtime-audit cold archive contains duplicate records.',
    );
  }
  const referencesByKey = new Map(
    rootReferences.map((reference) => [reference.key, reference]),
  );
  const edgesByKey = new Map();
  const queue = [...rootReferences];
  const reachable = new Set();
  while (queue.length > 0) {
    const reference = queue.shift();
    if (reachable.has(reference.key)) continue;
    const record = recordsByKey.get(reference.key);
    if (!record || !sameReference(reference, record)) {
      throw new Error(
        `Missing realtime-audit cold archive record: ${reference.key}`,
      );
    }
    reachable.add(reference.key);
    const block = parsedColdBlock(record);
    const childReferences = block
      ? collectAuditColdReferences(block)
      : [];
    edgesByKey.set(
      record.key,
      childReferences.map((child) => child.key),
    );
    for (const child of childReferences) {
      const prior = referencesByKey.get(child.key);
      if (prior && !sameReference(prior, child)) {
        throw new Error(
          'Conflicting realtime-audit cold references.',
        );
      }
      if (!prior) referencesByKey.set(child.key, child);
      queue.push(child);
    }
  }
  assertAcyclicColdGraph(rootReferences, edgesByKey);
  if (reachable.size !== recordsByKey.size) {
    throw new Error(
      'Realtime-audit cold archive contains unreachable records.',
    );
  }
  const ordered = [...recordsByKey.values()].sort((left, right) =>
    left.key.localeCompare(right.key),
  );
  for (const record of ordered) {
    await auditColdStore.put(record);
  }
  const durable = await exportAuditColdRecords(
    checkpoint,
    auditColdStore,
  );
  if (
    durable.length !== ordered.length ||
    durable.some(
      (record, index) =>
        !sameReference(record, ordered[index]) ||
        record.value !== ordered[index].value,
    )
  ) {
    throw new Error(
      'Realtime-audit cold archive was not durably imported.',
    );
  }
  return durable.map(referenceFromRecord);
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), {
      once: true,
    });
    request.addEventListener(
      'error',
      () =>
        reject(
          request.error ??
            new Error('IndexedDB request failed.'),
        ),
      { once: true },
    );
  });
}

function transactionComplete(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve, { once: true });
    const failed = () =>
      reject(
        transaction.error ??
          new Error('IndexedDB transaction failed.'),
      );
    transaction.addEventListener('abort', failed, { once: true });
    transaction.addEventListener('error', failed, { once: true });
  });
}

function openDatabase(indexedDB, databaseName) {
  const request = indexedDB.open(databaseName, 1);
  request.addEventListener('upgradeneeded', () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'key' });
    }
  });
  return requestResult(request);
}

export function createBrowserAuditColdStore({
  indexedDB = globalThis.indexedDB,
  databaseName = DATABASE_NAME,
} = {}) {
  if (!indexedDB || typeof indexedDB.open !== 'function') return null;
  let databasePromise = null;
  const database = () => {
    databasePromise ??= openDatabase(indexedDB, databaseName);
    return databasePromise;
  };

  async function getRecord(reference) {
    if (!validAuditColdReference(reference)) {
      throw new Error('Invalid realtime-audit cold reference.');
    }
    const db = await database();
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const record = await requestResult(
      transaction.objectStore(STORE_NAME).get(reference.key),
    );
    await transactionComplete(transaction);
    if (!record) {
      throw new Error(
        `Missing realtime-audit cold record: ${reference.key}`,
      );
    }
    const validated = validatedRecord(record);
    if (!sameReference(reference, validated)) {
      throw new Error(
        `Mismatched realtime-audit cold record: ${reference.key}`,
      );
    }
    return validated;
  }

  return Object.freeze({
    schema: COLD_TRANSPORT_SCHEMA,

    async put(record) {
      const validated = validatedRecord(record);
      const db = await database();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(validated);
      await transactionComplete(transaction);
      return referenceFromRecord(validated);
    },

    async verifyCheckpoint(checkpoint) {
      const directReferences = collectAuditColdReferences(checkpoint);
      const queue = [...directReferences];
      const verified = new Set();
      while (queue.length > 0) {
        const reference = queue.shift();
        if (verified.has(reference.key)) continue;
        const record = await getRecord(reference);
        verified.add(reference.key);
        if (record.kind !== 'block') continue;
        let block;
        try {
          block = JSON.parse(record.value);
        } catch {
          throw new Error(
            `Invalid realtime-audit cold block: ${record.key}`,
          );
        }
        queue.push(...collectAuditColdReferences(block));
      }
      return directReferences;
    },

    async get(reference) {
      return (await getRecord(reference)).value;
    },
  });
}

export const AUDIT_COLD_RECORD_SCHEMA = COLD_RECORD_SCHEMA;
export const AUDIT_COLD_TRANSPORT_SCHEMA = COLD_TRANSPORT_SCHEMA;
