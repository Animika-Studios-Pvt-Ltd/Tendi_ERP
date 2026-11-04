import { ApiError } from '../../utils/ApiError.js';

/**
 * Per-request upload lifecycle shared by the upload middleware and the storage service.
 *
 * Two different events used to be treated as one:
 *   - the response closing (normal end, or the client disconnecting), and
 *   - the request being aborted (client gone or body timeout before a response).
 * Resources (concurrency slots, buffers) are released only when the response has closed
 * AND every tracked operation (validation, storage, rollback) has settled. release() runs
 * the cleanup callback exactly once, however many times it is triggered.
 */
export function createUploadContext({ onRelease }) {
  let pending = 0;
  let responseClosed = false;
  let aborted = false;
  let released = false;

  const ctx = {
    get aborted() {
      return aborted;
    },
    get released() {
      return released;
    },
    get pendingOperations() {
      return pending;
    },

    markAborted() {
      aborted = true;
    },

    /** Keeps resources reserved until `promise` settles. Returns the original promise. */
    track(promise) {
      pending += 1;
      Promise.resolve(promise)
        .catch(() => {})
        .finally(() => {
          pending -= 1;
          maybeRelease();
        });
      return promise;
    },

    responseClosed() {
      responseClosed = true;
      maybeRelease();
    },

    release() {
      if (released) return;
      released = true;
      onRelease();
    },
  };

  function maybeRelease() {
    if (responseClosed && pending === 0) ctx.release();
  }

  return ctx;
}

const contextsByFile = new WeakMap();

export function bindFilesToContext(files, ctx) {
  for (const file of files) contextsByFile.set(file, ctx);
}

/** The context of a batch of files, or null for files not produced by createUpload(). */
export function getUploadContext(files) {
  return files.length ? contextsByFile.get(files[0]) ?? null : null;
}

export function uploadAbortedError() {
  return new ApiError(400, 'The upload was interrupted before it finished', { code: 'UPLOAD_ABORTED' });
}
