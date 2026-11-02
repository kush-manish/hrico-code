/** Entry point: build the app, listen, and stop cleanly on a signal. */
import { config, capabilities, describeMissing } from './config.js';
import { log } from './log.js';
import { createApp } from './app.js';

const app = createApp();
const server = app.listen(config.port, config.bind, () => {
  log.info('listening', { host: config.bind, port: config.port, capabilities: capabilities() });
  const missing = describeMissing();
  if (missing.length) log.warn('degraded: missing configuration', { missing });
});
server.headersTimeout = 120_000;
server.requestTimeout = 120_000;

let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info('shutting down', { signal });
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
process.on('unhandledRejection', reason => log.error('unhandled rejection', { err: String(reason) }));
process.on('uncaughtException', err => {
  log.error('uncaught exception', { err: err.message, stack: err.stack });
  process.exit(1);
});
