/**
 * CoinMarket MCP Service Registration
 * 
 * This script demonstrates how to register the CoinMarket MCP service with the InfinityOps system
 * Run with: ts-node register-coinmarket-mcp.ts
 */

import { registerRemoteMCPService, unregisterMCPService } from '../../backend/src/modules/mcp';
import { createModuleLogger } from '../../backend/src/utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const logger = createModuleLogger('register-coinmarket-mcp');

async function main() {
  try {
    logger.info('Starting CoinMarket MCP service registration');
    
    // Use environment variables or defaults
    const remoteUrl = process.env.COINMARKET_MCP_URL || 'http://localhost:5002';
    const apiKey = process.env.COINMARKET_MCP_API_KEY || 'test-api-key';
    
    // Register the CoinMarket MCP service
    const service = registerRemoteMCPService(
      'coinmarket-query',             // Unique ID
      'CoinMarket Data Service',      // User-friendly name
      'Provides cryptocurrency price quotes and market information', // Description
      {
        url: remoteUrl,
        apiKey: apiKey,
        timeout: 5000,
        maxRetries: 2,
        secure: remoteUrl.startsWith('https'),
        headers: {
          'User-Agent': 'InfinityOps/1.0'
        }
      },
      25 // Priority (lower numbers are higher priority)
    );
    
    logger.info(`CoinMarket MCP service registered successfully: ${service.name} (${service.id})`);
    
    // Test connection
    const isConnected = await service.testConnection();
    if (isConnected) {
      logger.info('Connection test successful');
      
      // Get service status
      const status = await service.getStatus();
      logger.info(`Service status: ${JSON.stringify(status)}`);
      
      // Show examples of how to use the service for crypto queries
      logger.info('Here are examples of crypto queries you can use:');
      logger.info('  What is the price of Bitcoin?');
      logger.info('  Show me the current Ethereum price');
      logger.info('  Get the latest information about Cardano');
      logger.info('  Display top 10 cryptocurrencies by market cap');
      logger.info('  BTC market stats');
      
      // Keep the service running for testing
      logger.info('Service registered successfully, waiting 30 seconds before unregistering...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Unregister the service
      await unregisterMCPService(service.id);
      logger.info('CoinMarket MCP service unregistered');
    } else {
      logger.error('Connection test failed, service may not be available');
      
      // Check service status
      const status = await service.getStatus();
      logger.error(`Service status: ${JSON.stringify(status)}`);
      
      // Try updating the configuration
      logger.info('Attempting to update service configuration and reconnect...');
      await service.updateConfig({
        timeout: 10000,  // Increase timeout
        maxRetries: 3    // Increase retry count
      });
      
      // Test connection again
      const retryConnection = await service.testConnection();
      if (retryConnection) {
        logger.info('Retry connection successful');
      } else {
        logger.error('Retry connection still failed, unregistering service');
        await unregisterMCPService(service.id);
      }
    }
  } catch (error) {
    logger.error(`Error registering CoinMarket MCP service: ${error}`);
  }
}

// Run the main function
main().catch(error => {
  logger.error(`Error in main function: ${error}`);
  process.exit(1);
}); 