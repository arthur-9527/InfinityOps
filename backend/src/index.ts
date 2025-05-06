import app from './app';
import { createModuleLogger } from './utils/logger';
import { createServer } from 'http';
import { createWebSocketServer } from './services/websocketService';
import { config } from './config';
import { createRedisService } from './services/redisService';

const logger = createModuleLogger('server');
const port = config.server.port;

// Initialize services
async function initServices() {
  try {
    // Initialize Redis
    const redisService = await createRedisService();
    logger.info('Redis service initialized');
    
    // Start HTTP server
    const server = createServer(app);
    server.listen(port, () => {
      logger.info(`HTTP Server running on port ${port}`);
    });
    
    // Start WebSocket server
    const wss = createWebSocketServer();
    logger.info('Terminal commands will be directly forwarded to SSH server (AI analysis disabled)');
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('SIGTERM signal received. Starting graceful shutdown...');
      
      // Close Redis connection
      await redisService.disconnect();
      logger.info('Redis connection closed');
      
      server.close(() => {
        logger.info('HTTP server closed');
        
        // Close WebSocket server
        wss.close(() => {
          logger.info('WebSocket server closed');
          process.exit(0);
        });
      });
    });
    
    process.on('SIGINT', async () => {
      logger.info('SIGINT signal received. Shutting down...');
      // Close Redis connection
      await redisService.disconnect();
      logger.info('Redis connection closed');
      process.exit(0);
    });
  } catch (error) {
    logger.error(`Error initializing services: ${(error as Error).message}`);
    process.exit(1);
  }
}

// Start the application
initServices().catch(error => {
  logger.error(`Failed to start application: ${error.message}`);
  process.exit(1);
}); 