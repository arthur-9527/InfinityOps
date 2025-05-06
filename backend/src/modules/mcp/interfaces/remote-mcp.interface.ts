/**
 * Remote MCP Service Interface
 * 
 * This interface defines the contract for remote MCP services.
 * Remote MCP services connect to external MCP servers via API.
 */

import { MCPRequestContext, MCPResponse, MCPService } from './mcp.interface';

export interface RemoteMCPConfig {
  /**
   * The URL of the remote MCP server
   */
  url: string;
  
  /**
   * API key for authentication (if required)
   */
  apiKey?: string;
  
  /**
   * Timeout in milliseconds for API requests
   */
  timeout?: number;
  
  /**
   * Max retries for failed requests
   */
  maxRetries?: number;
  
  /**
   * Whether to use HTTPS
   */
  secure?: boolean;
  
  /**
   * Additional headers to send with requests
   */
  headers?: Record<string, string>;
  
  /**
   * Whether to verify SSL certificates (for HTTPS connections)
   */
  verifySsl?: boolean;
}

export interface RemoteMCPStatus {
  /**
   * Whether the remote server is available
   */
  available: boolean;
  
  /**
   * The version of the remote MCP server
   */
  version?: string;
  
  /**
   * The last time the server was checked
   */
  lastChecked: Date;
  
  /**
   * Any error message if the server is unavailable
   */
  error?: string;
}

export interface RemoteMCPService extends MCPService {
  /**
   * The configuration for the remote MCP server
   */
  readonly config: RemoteMCPConfig;
  
  /**
   * Get the current status of the remote MCP server
   */
  getStatus(): Promise<RemoteMCPStatus>;
  
  /**
   * Update the configuration for the remote MCP server
   * @param config The new configuration
   */
  updateConfig(config: Partial<RemoteMCPConfig>): Promise<void>;
  
  /**
   * Test the connection to the remote MCP server
   * @returns True if the connection is successful, false otherwise
   */
  testConnection(): Promise<boolean>;
} 