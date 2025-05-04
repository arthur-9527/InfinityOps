import { createModuleLogger } from '../utils/logger';
import { MCPRegistry } from '../modules/mcp/registry/mcp.registry';
import { MCPRequestContext, MCPResponse } from '../modules/mcp/interfaces/mcp.interface';
import { v4 as uuidv4 } from 'uuid';

const logger = createModuleLogger('mcp-integration');

/**
 * MCPIntegrationService
 * 
 * This service integrates the WebSocket service with the MCP plugin system.
 * It processes incoming commands from the WebSocket and routes them to
 * the appropriate MCP service based on the command content.
 */
export class MCPIntegrationService {
  private static instance: MCPIntegrationService;
  private registry: MCPRegistry;
  
  private constructor() {
    this.registry = MCPRegistry.getInstance();
  }
  
  /**
   * Get the singleton instance of MCPIntegrationService
   */
  public static getInstance(): MCPIntegrationService {
    if (!MCPIntegrationService.instance) {
      MCPIntegrationService.instance = new MCPIntegrationService();
    }
    return MCPIntegrationService.instance;
  }
  
  /**
   * Process a command using the MCP registry
   * 
   * @param sessionId The session ID
   * @param command The command to process
   * @param path The current path
   * @param userId Optional user ID
   * @returns The response from the MCP service
   */
  public async processCommand(
    sessionId: string,
    command: string,
    path?: string,
    userId?: string
  ): Promise<MCPResponse> {
    // Create a request context
    const context: MCPRequestContext = {
      sessionId,
      userId,
      requestId: uuidv4(),
      input: command,
      path,
      timestamp: Date.now(),
      additionalContext: {}
    };
    
    logger.info(`Processing command through MCP: "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}" (sessionId: ${sessionId})`);
    
    try {
      // Process the request through the MCP registry
      const response = await this.registry.processRequest(context);
      logger.info(`MCP processed command with type: ${response.type}, success: ${response.success}`);
      return response;
    } catch (error) {
      logger.error(`Error processing command through MCP: ${error}`);
      
      // Return an error response
      return {
        type: 'error',
        content: `处理命令失败: ${(error as Error).message}`,
        success: false
      };
    }
  }
}

// Export a singleton instance
export const mcpIntegrationService = MCPIntegrationService.getInstance(); 