/**
 * Test multiple weather queries including both Chinese and English
 */

import dotenv from 'dotenv';
import { createModuleLogger } from '../utils/logger';
import { initializeMCPModule, shutdownMCPModule } from '../modules/mcp';
import { MCPRegistry } from '../modules/mcp/registry/mcp.registry';
import { MCPRequestContext } from '../modules/mcp/interfaces/mcp.interface';

// Load environment variables
dotenv.config();

const logger = createModuleLogger('test-weather-queries');

async function testWeatherQueries() {
  try {
    logger.info('Starting weather queries test');
    
    // Initialize the MCP module
    await initializeMCPModule();
    logger.info('MCP module initialized');
    
    // Get the MCP registry
    const registry = MCPRegistry.getInstance();
    
    // Create test requests - both Chinese and English
    const queries = [
      '武汉的天气怎么样',
      '成都今天天气如何',
      '厦门明天会下雨吗',
      '天津的气温是多少',
      'weather in new york',
      'tokyo weather forecast',
      'will it rain in london tomorrow',
      'current temperature in paris'
    ];
    
    for (const query of queries) {
      logger.info(`\n========== Testing query: "${query}" ==========`);
      
      // Create request context
      const context: MCPRequestContext = {
        sessionId: 'test-session',
        requestId: `test-req-${Date.now()}`,
        input: query,
        timestamp: Date.now()
      };
      
      // First check canHandle scores from each service
      logger.info('Checking canHandle scores:');
      const services = MCPRegistry.getInstance().getServices();
      for (const service of services) {
        try {
          const score = await service.canHandle(context);
          logger.info(`  Service: ${service.name} (${service.id}), Score: ${score}`);
        } catch (error) {
          logger.error(`  Error getting score for service ${service.name}: ${error}`);
        }
      }
      
      // Process the request with the MCP registry
      logger.info('Processing request with MCP registry');
      const response = await registry.processRequest(context);
      logger.info('Service selected. Response received:');
      console.log(JSON.stringify(response, null, 2));
      
      // Add space between tests
      logger.info('=================================================\n');
    }
    
  } catch (error) {
    logger.error(`Error testing weather queries: ${error}`);
  } finally {
    // Shutdown MCP module
    await shutdownMCPModule();
    logger.info('MCP module shutdown complete');
  }
}

// Run the test
testWeatherQueries().catch(error => {
  logger.error(`Unhandled error in test: ${error}`);
  process.exit(1);
}); 