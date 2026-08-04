import {
  decodeCheckpoint,
  encodeCheckpoint,
} from './storage-codec.js?v=20260804-01';

const REQUEST_TYPE = 'LZY_COMPRESS_CHECKPOINT';
const RESPONSE_TYPE = 'LZY_CHECKPOINT_COMPRESSED';

function errorMessage(error) {
  return error instanceof Error
    ? error.message
    : String(error ?? 'Unknown checkpoint compression failure.');
}

globalThis.addEventListener('message', (event) => {
  const message = event.data;
  if (
    !message ||
    message.type !== REQUEST_TYPE ||
    !Number.isSafeInteger(message.requestId)
  ) {
    return;
  }
  try {
    const checkpointCodec = encodeCheckpoint(message.checkpoint);
    // Verification stays off the main thread. It proves the exact packed
    // payload can be decoded before the browser is asked to persist it.
    const checkpoint = decodeCheckpoint(checkpointCodec);
    globalThis.postMessage({
      type: RESPONSE_TYPE,
      requestId: message.requestId,
      status: 'ok',
      checkpointCodec,
      checkpoint,
    });
  } catch (error) {
    globalThis.postMessage({
      type: RESPONSE_TYPE,
      requestId: message.requestId,
      status: 'error',
      error: errorMessage(error),
    });
  }
});
