import app from './app';
import { createModuleLogger } from './utils/logger';
import { createServer } from 'http';
import { createWebSocketServer } from './services/websocketService';
import { config } from './config';

const logger = createModuleLogger('server');
const port = config.server.port;

// Start HTTP server
const server = createServer(app);
server.listen(port, () => {
  logger.info(`HTTP Server running on port ${port}`);
});

// Start WebSocket server
const wss = createWebSocketServer();
logger.info('Terminal commands will be directly forwarded to SSH server (AI analysis disabled)');

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM signal received. Starting graceful shutdown...');
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close WebSocket server
    wss.close(() => {
      logger.info('WebSocket server closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT signal received. Shutting down...');
  process.exit(0);
}); 