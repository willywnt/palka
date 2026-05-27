import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { getWorkerHealthSnapshot } from '@olshop/queue';
import { logger } from '@olshop/utils/logger';

export function startHealthServer(port: number): ReturnType<typeof createServer> {
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.url !== '/health') {
      response.writeHead(404, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ error: 'Not found' }));
      return;
    }

    try {
      const health = await getWorkerHealthSnapshot();
      const statusCode = health.status === 'error' ? 503 : 200;

      response.writeHead(statusCode, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(health));
    } catch (error) {
      logger.error('worker.healthcheck.failed', {
        error: error instanceof Error ? error.message : String(error),
      });

      response.writeHead(503, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ status: 'error', timestamp: new Date().toISOString() }));
    }
  });

  server.listen(port, () => {
    logger.info('worker.health.started', { port });
  });

  return server;
}
