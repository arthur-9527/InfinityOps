/**
 * Test specific weather query
 */

import dotenv from 'dotenv';
import { createModuleLogger } from '../utils/logger';
import { initializeMCPModule, shutdownMCPModule } from '../modules/mcp';
import { MCPRegistry } from '../modules/mcp/registry/mcp.registry';
import { MCPRequestContext } from '../modules/mcp/interfaces/mcp.interface';

// Load environment variables
dotenv.config();

const logger = createModuleLogger('test-specific-query');

async function testSpecificQuery() {
  try {
    logger.info('Starting specific query test');
    
    // Initialize the MCP module
    await initializeMCPModule();
    logger.info('MCP module initialized');
    
    // Get the MCP registry
    const registry = MCPRegistry.getInstance();
    
    // Create test request
    const query = '武汉的天气怎么样';
    logger.info(`Testing with query: "${query}"`);
    
    // Create request context
    const context: MCPRequestContext = {
      sessionId: 'test-session',
      requestId: `test-req-specific`,
      input: query,
      timestamp: Date.now()
    };
    
    // Process the request with the MCP registry
    logger.info('Processing request with MCP registry');
    const response = await registry.processRequest(context);
    logger.info('Response received:');
    console.log(JSON.stringify(response, null, 2));
    
  } catch (error) {
    logger.error(`Error testing specific query: ${error}`);
  } finally {
    // Shutdown MCP module
    await shutdownMCPModule();
    logger.info('MCP module shutdown complete');
  }
}

// Run the test
testSpecificQuery().catch(error => {
  logger.error(`Unhandled error in test: ${error}`);
  process.exit(1);
}); 