import { MCPRegistry } from './registry/mcp.registry';
import { commandMCPService } from './services/command-analysis.mcp';
import { createModuleLogger } from '../../utils/logger';

const logger = createModuleLogger('mcp-module');

/**
 * Initializes the MCP module and registers internal services
 * This function should be called when the application starts
 */
export async function initializeMCPModule(): Promise<void> {
  logger.info('Initializing MCP module');
  const registry = MCPRegistry.getInstance();
  
  // Register internal MCP services
  try {
    registry.registerService(commandMCPService);
    logger.info('Internal command analysis MCP service registered');
    
    // Initialize the registry (which will initialize all services)
    await registry.initialize();
    logger.info('MCP module initialized successfully');
  } catch (error) {
    logger.error(`Error initializing MCP module: ${error}`);
    throw error;
  }
}

/**
 * Shuts down the MCP module and all registered services
 * This function should be called when the application shuts down
 */
export async function shutdownMCPModule(): Promise<void> {
  logger.info('Shutting down MCP module');
  const registry = MCPRegistry.getInstance();
  
  try {
    await registry.shutdown();
    logger.info('MCP module shutdown complete');
  } catch (error) {
    logger.error(`Error shutting down MCP module: ${error}`);
    throw error;
  }
}

/**
 * Registers an external MCP service
 * This function can be used by plugins to register their own MCP services
 */
export function registerMCPService(service: any): void {
  const registry = MCPRegistry.getInstance();
  registry.registerService(service);
  logger.info(`External MCP service registered: ${service.name} (${service.id})`);
}

// Export other MCP components
export * from './interfaces/mcp.interface';
export * from './registry/mcp.registry';
export * from './services/base-mcp.service';
export * from './services/command-analysis.mcp'; 