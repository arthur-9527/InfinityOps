/**
 * Remote MCP Service Interface Definitions
 * 
 * This file defines the interfaces required for MCP servers to interact with the InfinityOps system
 */

// MCP Request Context
export interface MCPRequestContext {
  sessionId: string;
  userId?: string;
  requestId: string;
  input: string;
  path?: string;
  timestamp: number;
  additionalContext?: Record<string, any>;
}

// MCP Response
export interface MCPResponse {
  type: string;        // Response type: 'info', 'error', 'warning', 'success', etc.
  content: string;     // Response content, usually a text message
  success: boolean;    // Whether the request was successfully processed
  metadata?: Record<string, any>; // Additional information
  shouldProcess?: boolean;        // Whether further processing is needed
  requireConfirmation?: boolean;  // Whether user confirmation is required
  confirmationMessage?: string;   // Confirmation message
  isAwaitingConfirmation?: boolean; // Whether awaiting confirmation
}

// Capability Check Response
export interface CanHandleResponse {
  score: number; // Confidence score from 0-1
}

// Server Status Response
export interface StatusResponse {
  status: string;           // Server status
  version: string;          // Server version
  capabilities: string[];   // Server capabilities
  uptime?: number;          // Uptime in seconds
  requestsProcessed?: number; // Number of requests processed
}

// Confirmation Request
export interface ConfirmationRequest {
  context: MCPRequestContext;
  isConfirmed: boolean; // Whether the user confirmed
}

// Request Wrapper
export interface MCPRequest {
  context: MCPRequestContext;
}

// CoinMarket specific interfaces
export interface CurrencyListing {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  price: number;
  market_cap: number;
  volume_24h: number;
  percent_change_24h: number;
  percent_change_7d: number;
  rank: number;
  last_updated: string;
}

export interface CurrencyQuote {
  id: number;
  name: string;
  symbol: string;
  slug: string;
  price: number;
  market_cap: number;
  volume_24h: number;
  percent_change_1h: number;
  percent_change_24h: number;
  percent_change_7d: number;
  circulating_supply: number;
  total_supply: number;
  max_supply: number;
  last_updated: string;
}

export interface ToolRequest {
  slug?: string;
  symbol?: string;
  limit?: number;
  convert?: string;
} 