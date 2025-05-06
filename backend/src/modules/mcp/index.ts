import { MCPRegistry } from './registry/mcp.registry';
import { commandMCPService } from './services/command-analysis.mcp';
import { createModuleLogger } from '../../utils/logger';
import { RemoteMCPConfig, RemoteMCPService } from './interfaces/remote-mcp.interface';
import { RemoteCommandAnalysisService } from './services/command-analysis.service';
import { initializeWeatherMCPService } from './services/weather-mcp-integration';
import { initializeCoinMarketMCPService } from './services/coinmarket-mcp-integration';
import { aiRoutingMCPService } from './services/ai-routing.mcp';

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
    // 注册AI路由服务（优先注册，因为优先级较高）
    registry.registerService(aiRoutingMCPService);
    logger.info('AI意图路由服务已注册');
    
    // 注册命令分析服务
    registry.registerService(commandMCPService);
    logger.info('Internal command analysis MCP service registered');
    
    // Initialize Weather MCP service
    initializeWeatherMCPService();
    logger.info('Weather MCP service initialization requested');
    
    // Initialize CoinMarket MCP service
    initializeCoinMarketMCPService();
    logger.info('CoinMarket MCP service initialization requested');
    
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

/**
 * Creates and registers a remote MCP service
 * This function can be used to connect to external MCP servers
 */
export function registerRemoteMCPService(
  id: string,
  name: string,
  description: string,
  config: RemoteMCPConfig,
  priority: number = 50
): RemoteMCPService {
  const service = new RemoteCommandAnalysisService(id, name, description, priority, config);
  registerMCPService(service);
  return service;
}

/**
 * Unregisters an MCP service
 * This function can be used to remove registered MCP services
 */
export async function unregisterMCPService(serviceId: string): Promise<void> {
  const registry = MCPRegistry.getInstance();
  await registry.unregisterService(serviceId);
  logger.info(`MCP service unregistered: ${serviceId}`);
}

// Export other MCP components
export * from './interfaces/mcp.interface';
export * from './interfaces/remote-mcp.interface';
export * from './registry/mcp.registry';
export * from './services/base-mcp.service';
export * from './services/command-analysis.mcp';
export * from './services/command-analysis.service'; 