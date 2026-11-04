/**
 * Process-wide application lifecycle. "ready" means the HTTP server is listening and
 * not shutting down; readiness probes combine this with the database state.
 */
let appReady = false;

export function setAppReady(ready) {
  appReady = Boolean(ready);
}

export function isAppReady() {
  return appReady;
}
