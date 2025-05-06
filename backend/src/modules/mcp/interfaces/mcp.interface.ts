/**
 * MCP (Master Control Program) Service Interface
 * 
 * This interface defines the contract for all MCP services.
 * Each MCP service should implement this interface to ensure
 * consistent behavior and integration with the MCP registry.
 */

export interface MCPRequestContext {
  sessionId: string;
  userId?: string;
  requestId: string;
  input: string;
  path?: string;
  timestamp: number;
  additionalContext?: Record<string, any>;
}

export interface MCPResponse {
  type: string;
  content: string;
  success: boolean;
  metadata?: Record<string, any>;
  shouldProcess?: boolean;
  requireConfirmation?: boolean;
  confirmationMessage?: string;
  isAwaitingConfirmation?: boolean;
  shouldRoute?: boolean;
}

export interface MCPService {
  /**
   * Unique identifier for the MCP service
   */
  readonly id: string;
  
  /**
   * User-friendly name of the service
   */
  readonly name: string;
  
  /**
   * Description of what the service does
   */
  readonly description: string;
  
  /**
   * Priority of the service (lower number = higher priority)
   * Used by the registry to determine the order of service checks
   */
  readonly priority: number;
  
  /**
   * Whether this service is a system service that's built-in
   */
  readonly isSystemService: boolean;
  
  /**
   * Initialize the service
   * Called when the service is registered with the MCP registry
   */
  initialize(): Promise<void>;
  
  /**
   * Shutdown the service
   * Called when the service is unregistered or the system is shutting down
   */
  shutdown(): Promise<void>;
  
  /**
   * Check if this service can handle the given request
   * 
   * @param context The request context
   * @returns A score between 0 and 1 indicating how confident this service
   *          is that it can handle the request (0 = cannot handle, 1 = definitely can handle)
   */
  canHandle(context: MCPRequestContext): Promise<number>;
  
  /**
   * Process the request and return a response
   * 
   * @param context The request context
   * @returns The response from the service
   */
  process(context: MCPRequestContext): Promise<MCPResponse>;
  
  /**
   * Handle confirmation responses (yes/no) for actions that require user confirmation
   * 
   * @param context The request context
   * @param isConfirmed Whether the user confirmed the action
   * @returns The response after processing the confirmation
   */
  handleConfirmation(context: MCPRequestContext, isConfirmed: boolean): Promise<MCPResponse>;
} 