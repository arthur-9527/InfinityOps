import { registerRemoteMCPService } from '../index';
import { createModuleLogger } from '../../../utils/logger';

const logger = createModuleLogger('coinmarket-mcp-integration');

/**
 * Initialize and register the CoinMarket MCP service
 * This function connects to the external CoinMarket MCP server
 */
export function initializeCoinMarketMCPService(): void {
  logger.info('Initializing CoinMarket MCP service');
  
  // Get configuration from environment variables
  const coinmarketMcpUrl = process.env.COINMARKET_MCP_URL || 'http://localhost:5002';
  const coinmarketMcpApiKey = process.env.COINMARKET_MCP_API_KEY || '';
  
  try {
    // Register the CoinMarket MCP service
    const coinmarketMcpService = registerRemoteMCPService(
      'coinmarket-mcp-service',           // Unique ID
      'CoinMarket Data Service',          // User-friendly name
      'Provides cryptocurrency price quotes and market information', // Description
      {
        url: coinmarketMcpUrl,            // URL from environment variable
        apiKey: coinmarketMcpApiKey,      // API key from environment variable
        timeout: 10000,                   // 10 seconds timeout
        maxRetries: 3,                    // Maximum 3 retries
        secure: coinmarketMcpUrl.startsWith('https://'), // Use HTTPS if the URL starts with https://
        headers: {                        // Additional headers
          'X-Service-Type': 'coinmarket',
          'Accept-Language': 'en-US,zh-CN' // Support both English and Chinese
        }
      },
      5                                  // Priority (equal to weather MCP to ensure high priority for crypto queries)
    );
    
    // Test the connection
    coinmarketMcpService.testConnection()
      .then(isConnected => {
        if (isConnected) {
          logger.info('Successfully connected to CoinMarket MCP server');
          logger.info('CoinMarket MCP server configured for both English and Chinese queries');
        } else {
          logger.warn('Failed to connect to CoinMarket MCP server');
        }
      })
      .catch(error => {
        logger.error(`Error testing connection to CoinMarket MCP server: ${error}`);
      });
    
    logger.info('CoinMarket MCP service registered successfully');
  } catch (error) {
    logger.error(`Error registering CoinMarket MCP service: ${error}`);
  }
} 