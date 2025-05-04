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
   * @param additionalContext Additional context for the request
   * @returns The response from the MCP service
   */
  public async processCommand(
    sessionId: string,
    command: string,
    path?: string,
    userId?: string,
    additionalContext: Record<string, any> = {}
  ): Promise<MCPResponse> {
    // Create a request context
    const context: MCPRequestContext = {
      sessionId,
      userId,
      requestId: uuidv4(),
      input: command,
      path,
      timestamp: Date.now(),
      additionalContext: {
        ...additionalContext
      }
    };
    
    logger.info(`Processing command through MCP: "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}" (sessionId: ${sessionId})`);
    
    try {
      // Process the request through the MCP registry
      // MCP registry will:
      // 1. Ask all registered services for their confidence score
      // 2. Select the service with highest confidence
      // 3. Process the request with the selected service
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
  
  /**
   * Handle a confirmation response for a pending command
   * 
   * @param sessionId The session ID
   * @param isConfirmed Whether the command was confirmed
   * @param originalInput The original input that contained the confirmation
   * @returns The response from the MCP service
   */
  public async handleConfirmation(
    sessionId: string,
    isConfirmed: boolean,
    originalInput?: string
  ): Promise<MCPResponse> {
    // Create a confirmation context
    const context: MCPRequestContext = {
      sessionId,
      requestId: uuidv4(),
      input: isConfirmed ? 'yes' : 'no',
      timestamp: Date.now(),
      additionalContext: {
        isConfirmationResponse: true,
        confirmationValue: isConfirmed,
        originalInput
      }
    };
    
    logger.info(`Processing confirmation (${isConfirmed ? 'confirmed' : 'rejected'}) through MCP for session ${sessionId}`);
    
    try {
      // Process through the registry, which will find the service waiting for confirmation
      const response = await this.registry.processRequest(context);
      logger.info(`Confirmation processed with type: ${response.type}, success: ${response.success}`);
      return response;
    } catch (error) {
      logger.error(`Error processing confirmation through MCP: ${error}`);
      
      // Return an error response
      return {
        type: 'error',
        content: `处理确认操作失败: ${(error as Error).message}`,
        success: false
      };
    }
  }
}

// Export a singleton instance
export const mcpIntegrationService = MCPIntegrationService.getInstance(); 