/**
 * Weather MCP Service Test Script
 * 
 * This script tests the integration with the Weather MCP service.
 * It initializes the MCP module, sends a test request to the Weather MCP,
 * and prints the result.
 */

import dotenv from 'dotenv';
import { createModuleLogger } from '../utils/logger';
import { initializeMCPModule, shutdownMCPModule } from '../modules/mcp';
import { MCPRegistry } from '../modules/mcp/registry/mcp.registry';
import { MCPRequestContext } from '../modules/mcp/interfaces/mcp.interface';

// Load environment variables
dotenv.config();

const logger = createModuleLogger('test-weather-mcp');

async function testWeatherMCP() {
  try {
    logger.info('Starting Weather MCP test');
    
    // Initialize the MCP module
    await initializeMCPModule();
    logger.info('MCP module initialized');
    
    // Get the MCP registry
    const registry = MCPRegistry.getInstance();
    
    // Create a test request to ask about the weather
    const testRequests = [
      '北京今天天气如何？',
      '上海明天会下雨吗？',
      '广州今日气温是多少？',
      'What is the weather in New York today?',
      'Will it rain in Tokyo tomorrow?'
    ];
    
    for (const request of testRequests) {
      logger.info(`Testing with request: "${request}"`);
      
      // Create request context
      const context: MCPRequestContext = {
        sessionId: 'test-session',
        requestId: `test-req-${Date.now()}`,
        input: request,
        timestamp: Date.now(),
        additionalContext: {
          source: 'test-script'
        }
      };
      
      // Process the request with the MCP registry
      logger.info('Processing request with MCP registry');
      const response = await registry.processRequest(context);
      logger.info('Response received:');
      console.log(JSON.stringify(response, null, 2));
      
      // If confirmation is required, handle it
      if (response.requireConfirmation) {
        logger.info('Confirmation required, sending confirmation...');
        
        // Create a new context for the confirmation
        const confirmationContext: MCPRequestContext = {
          ...context,
          requestId: `test-confirm-${Date.now()}`,
          input: 'yes',
          timestamp: Date.now()
        };
        
        // Process the confirmation request
        const confirmationResponse = await registry.processRequest(confirmationContext);
        logger.info('Confirmation response received:');
        console.log(JSON.stringify(confirmationResponse, null, 2));
      }
      
      // Add some space between tests
      console.log('\n---------------------------------------------------\n');
    }
  } catch (error) {
    logger.error(`Error testing Weather MCP: ${error}`);
  } finally {
    // Shutdown MCP module
    await shutdownMCPModule();
    logger.info('MCP module shutdown complete');
  }
}

// Run the test
testWeatherMCP().catch(error => {
  logger.error(`Unhandled error in test: ${error}`);
  process.exit(1);
}); 