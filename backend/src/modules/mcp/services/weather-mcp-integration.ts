import { registerRemoteMCPService } from '../index';
import { createModuleLogger } from '../../../utils/logger';

const logger = createModuleLogger('weather-mcp-integration');

/**
 * Initialize and register the Weather MCP service
 * This function connects to the external Weather MCP server
 */
export function initializeWeatherMCPService(): void {
  logger.info('Initializing Weather MCP service');
  
  // Get configuration from environment variables
  const weatherMcpUrl = process.env.WEATHER_MCP_URL || 'http://localhost:5001';
  const weatherMcpApiKey = process.env.WEATHER_MCP_API_KEY || '';
  
  try {
    // Register the Weather MCP service
    const weatherMcpService = registerRemoteMCPService(
      'weather-mcp-service',           // Unique ID
      '中国天气查询服务',                  // User-friendly name
      '连接到外部中国天气查询服务器',      // Description
      {
        url: weatherMcpUrl,            // URL from environment variable
        apiKey: weatherMcpApiKey,      // API key from environment variable
        timeout: 10000,                // 10 seconds timeout
        maxRetries: 3,                 // Maximum 3 retries
        secure: weatherMcpUrl.startsWith('https://'), // Use HTTPS if the URL starts with https://
        headers: {                     // Additional headers
          'X-Service-Type': 'weather'
        }
      },
      5                               // Priority (lower number = higher priority, set to 5 to be higher than command analysis at 10)
    );
    
    // Test the connection
    weatherMcpService.testConnection()
      .then(isConnected => {
        if (isConnected) {
          logger.info('Successfully connected to Weather MCP server');
        } else {
          logger.warn('Failed to connect to Weather MCP server');
        }
      })
      .catch(error => {
        logger.error(`Error testing connection to Weather MCP server: ${error}`);
      });
    
    logger.info('Weather MCP service registered successfully');
  } catch (error) {
    logger.error(`Error registering Weather MCP service: ${error}`);
  }
} 