import app from './app';
import http from 'http';
import { createModuleLogger } from './utils/logger';
import { initializeMCPModule, shutdownMCPModule } from './modules/mcp';
import { createWebSocketServer } from './services/websocketService';

const logger = createModuleLogger('server');
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    // Create HTTP server
    const server = http.createServer(app);
    
    // Initialize MCP module
    logger.info('Initializing MCP module...');
    await initializeMCPModule();
    logger.info('MCP module initialized successfully');
    
    // Initialize WebSocket service
    logger.info('Initializing WebSocket service...');
    const wss = createWebSocketServer();
    logger.info('WebSocket service initialized successfully');
    
    // Start the server
    server.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });
    
    // Handle graceful shutdown
    const handleShutdown = async () => {
      logger.info('Shutting down server...');
      
      // Shutdown MCP module
      try {
        await shutdownMCPModule();
        logger.info('MCP module shutdown successfully');
      } catch (error) {
        logger.error(`Error shutting down MCP module: ${error}`);
      }
      
      // Shutdown WebSocket service
      try {
        if (wss) {
          wss.close();
          logger.info('WebSocket service shutdown successfully');
        }
      } catch (error) {
        logger.error(`Error shutting down WebSocket service: ${error}`);
      }
      
      // Close HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });
      
      // Force exit after timeout
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 5000);
    };
    
    // Register shutdown handlers
    process.on('SIGTERM', handleShutdown);
    process.on('SIGINT', handleShutdown);
    
  } catch (error) {
    logger.error(`Failed to start server: ${error}`);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  logger.error(`Unexpected error during startup: ${error}`);
  process.exit(1);
}); 