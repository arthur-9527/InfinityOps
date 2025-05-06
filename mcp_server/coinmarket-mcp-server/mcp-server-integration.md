# MCP Server Integration Guide

This document explains how the CoinMarket MCP Server integrates with the InfinityOps platform and the overall MCP (Model Control Protocol) architecture.

## What is MCP?

MCP (Model Control Protocol) is a standardized interface for AI assistants to communicate with external tools and services. It allows models like Claude to use tools beyond their training data, such as accessing real-time cryptocurrency data.

## MCP Server Architecture

An MCP server implements a set of standardized endpoints that allow AI models to:

1. Determine if the server can handle a specific request
2. Process the request and return formatted results
3. Handle user confirmations when needed
4. Expose specific tools for structured data access

## Standard Endpoints

### 1. Status Check (`GET /api/status`)

Returns information about the server's status, capabilities, and metrics:

```json
{
  "status": "online",
  "version": "1.0.0",
  "capabilities": ["get-currency-listings", "get-quotes"],
  "uptime": 3600,
  "requestsProcessed": 42
}
```

### 2. Can Handle (`POST /api/can-handle`)

Takes a request context and returns a confidence score (0-1) indicating how well the server can handle the request:

```json
// Request
{
  "context": {
    "sessionId": "abc123",
    "requestId": "req456",
    "input": "What is the price of Bitcoin?",
    "timestamp": 1678901234567
  }
}

// Response
{
  "score": 0.95
}
```

### 3. Process (`POST /api/process`)

Processes the actual request and returns a formatted response:

```json
// Request
{
  "context": {
    "sessionId": "abc123",
    "requestId": "req456",
    "input": "What is the price of Bitcoin?",
    "timestamp": 1678901234567
  }
}

// Response
{
  "type": "info",
  "content": "# Bitcoin (BTC)\n\n**Current Price:** $45,678.90\n...",
  "success": true,
  "metadata": {
    "cryptoData": { ... },
    "queryType": "quotes",
    "params": { "slug": "bitcoin" }
  }
}
```

### 4. Handle Confirmation (`POST /api/handle-confirmation`)

Handles user confirmations when additional information is needed:

```json
// Request
{
  "context": {
    "sessionId": "abc123",
    "requestId": "req789",
    "input": "Yes, I want information about Ethereum",
    "timestamp": 1678901234567
  },
  "isConfirmed": true
}

// Response
{
  "type": "info",
  "content": "# Ethereum (ETH)\n\n**Current Price:** $2,345.67\n...",
  "success": true,
  "metadata": { ... }
}
```

## CoinMarket-Specific Tool Endpoints

### Get Currency Listings (`POST /api/tools/get-currency-listings`)

Returns a list of top cryptocurrencies:

```json
// Request
{
  "limit": 5
}

// Response
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Bitcoin",
      "symbol": "BTC",
      "slug": "bitcoin",
      "price": 45678.90,
      "market_cap": 876543210000,
      "volume_24h": 23456789000,
      "percent_change_24h": 2.34,
      "percent_change_7d": -1.23,
      "rank": 1,
      "last_updated": "2023-05-20T12:34:56.789Z"
    },
    // ... more cryptocurrencies
  ]
}
```

### Get Quotes (`POST /api/tools/get-quotes`)

Returns detailed information about a specific cryptocurrency:

```json
// Request
{
  "slug": "bitcoin"
  // OR "symbol": "BTC"
}

// Response
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Bitcoin",
    "symbol": "BTC",
    "slug": "bitcoin",
    "price": 45678.90,
    "market_cap": 876543210000,
    "volume_24h": 23456789000,
    "percent_change_1h": 0.12,
    "percent_change_24h": 2.34,
    "percent_change_7d": -1.23,
    "circulating_supply": 19000000,
    "total_supply": 19000000,
    "max_supply": 21000000,
    "last_updated": "2023-05-20T12:34:56.789Z"
  }
}
```

## Integration with InfinityOps

The CoinMarket MCP server is registered with the InfinityOps platform using the `register-coinmarket-mcp.ts` script, which:

1. Connects to the InfinityOps MCP registry
2. Registers the server's capabilities and endpoint
3. Sets up authentication and communication channels
4. Configures priority and retry settings

When a user asks a question about cryptocurrency prices or market information, the InfinityOps system:

1. Checks all registered MCP services to find the most appropriate one
2. Routes the request to the CoinMarket MCP server if it has the highest confidence score
3. Returns the formatted response to the user

## Security Considerations

- All endpoints (except status) require API key authentication
- Data is cached to reduce load on the CoinMarketCap API
- Requests are logged for debugging and monitoring
- Rate limiting is applied to prevent abuse

## Extending the Server

To add new capabilities to the CoinMarket MCP server:

1. Define new interfaces in `remote-mcp.interface.ts`
2. Add new endpoints to `coinmarket-mcp-server.ts`
3. Update the capabilities list in the status response
4. Enhance the confirmation handling logic if needed
5. Update the documentation 