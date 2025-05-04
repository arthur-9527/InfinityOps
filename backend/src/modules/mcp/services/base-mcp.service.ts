import { MCPRequestContext, MCPResponse, MCPService } from '../interfaces/mcp.interface';
import { createModuleLogger } from '../../../utils/logger';

/**
 * Base class for MCP services that provides common functionality
 * and default implementations for the MCPService interface.
 */
export abstract class BaseMCPService implements MCPService {
  protected logger;
  protected pendingConfirmations: Map<string, MCPRequestContext> = new Map();
  
  /**
   * Unique identifier for the MCP service
   */
  abstract readonly id: string;
  
  /**
   * User-friendly name of the service
   */
  abstract readonly name: string;
  
  /**
   * Description of what the service does
   */
  abstract readonly description: string;
  
  /**
   * Priority of the service (lower number = higher priority)
   */
  abstract readonly priority: number;
  
  /**
   * Whether this service is a system service that's built-in
   */
  abstract readonly isSystemService: boolean;
  
  constructor() {
    // Initialize logger in constructor once subclass has set the id property
    this.logger = createModuleLogger(`mcp-service`);
  }
  
  /**
   * Update logger with proper service ID after initialization
   */
  protected initLogger(): void {
    if (this.id) {
      this.logger = createModuleLogger(`mcp-${this.id}`);
    }
  }
  
  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    this.initLogger();
    this.logger.info(`Initializing MCP service: ${this.name}`);
  }
  
  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    this.logger.info(`Shutting down MCP service: ${this.name}`);
    // Clear any pending confirmations
    this.pendingConfirmations.clear();
  }
  
  /**
   * Check if this service can handle the given request
   * 
   * @param context The request context
   * @returns A score between 0 and 1 indicating confidence
   */
  abstract canHandle(context: MCPRequestContext): Promise<number>;
  
  /**
   * Process the request and return a response
   * 
   * @param context The request context
   * @returns The response from the service
   */
  abstract process(context: MCPRequestContext): Promise<MCPResponse>;
  
  /**
   * Handle confirmation responses (yes/no) for actions that require user confirmation
   * 
   * @param context The request context
   * @param isConfirmed Whether the user confirmed the action
   * @returns The response after processing the confirmation
   */
  async handleConfirmation(context: MCPRequestContext, isConfirmed: boolean): Promise<MCPResponse> {
    this.logger.info(`Handling confirmation response for request: ${context.requestId}, confirmed: ${isConfirmed}`);
    
    if (!isConfirmed) {
      return {
        type: 'info',
        content: '操作已取消。',
        success: true
      };
    }
    
    // Default implementation just returns a success message
    // Subclasses should override this method to provide meaningful handling
    return {
      type: 'info',
      content: '操作已确认。',
      success: true
    };
  }
  
  /**
   * Create a MCPResponse object with common fields
   */
  protected createResponse(
    type: string,
    content: string,
    success: boolean = true,
    metadata: Record<string, any> = {}
  ): MCPResponse {
    return {
      type,
      content,
      success,
      metadata
    };
  }
  
  /**
   * Create a confirmation request response
   */
  protected createConfirmationRequest(
    type: string,
    content: string,
    confirmationMessage: string,
    metadata: Record<string, any> = {}
  ): MCPResponse {
    return {
      type,
      content,
      success: true,
      metadata,
      requireConfirmation: true,
      isAwaitingConfirmation: true,
      confirmationMessage
    };
  }
  
  /**
   * Create an error response
   */
  protected createErrorResponse(
    errorMessage: string,
    metadata: Record<string, any> = {}
  ): MCPResponse {
    return this.createResponse('error', errorMessage, false, metadata);
  }
} 