# CoinMarket MCP Server

An MCP (Model Control Protocol) server for cryptocurrency data from CoinMarketCap API, designed to integrate with InfinityOps platform.

## Features

- Provides cryptocurrency price quotes and market information
- Implements standard MCP protocol for interfacing with InfinityOps
- Two main tools:
  - `get-currency-listings`: Get the latest cryptocurrency listings
  - `get-quotes`: Get quotes for specific tokens (by slug or symbol)

## Requirements

- Node.js 16.x or higher
- CoinMarketCap API key

## Setup

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the example environment file and edit it:
   ```
   cp env.example .env
   ```
4. Add your CoinMarketCap API key to the `.env` file

## Running the Server

### Development Mode

```
npm run dev
```

The server will run on port 5002 by default. You can change this by setting the `PORT` environment variable.

### Production Mode

```
npm run build
npm start
```

## API Endpoints

### Status Check
- **GET** `/api/status`
- No authentication required
- Returns server status, capabilities, and metrics

### MCP Standard Endpoints
- **POST** `/api/can-handle`
- **POST** `/api/process`
- **POST** `/api/handle-confirmation`

### Tool Endpoints
- **POST** `/api/tools/get-currency-listings`
  - Parameters:
    - `limit` (optional): Number of cryptocurrencies to return (default: 10)
- **POST** `/api/tools/get-quotes`
  - Parameters:
    - `slug` or `symbol`: Identifier for the cryptocurrency
    - `convert` (optional): Currency to convert to (default: USD)

## Authentication

All endpoints except `/api/status` require an API key that matches the one in your `.env` file. 
Provide it in the `x-api-key` header.

## Registering with InfinityOps

Use the `register-coinmarket-mcp.ts` script to register the service with InfinityOps:

```
ts-node register-coinmarket-mcp.ts
```

## License

MIT 