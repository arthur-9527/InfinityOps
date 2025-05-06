/**
 * CoinMarket MCP Server
 * 
 * This server implements a standard MCP interface for querying cryptocurrency information
 * from CoinMarketCap API
 */

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { 
  MCPRequestContext, 
  MCPResponse, 
  CanHandleResponse,
  StatusResponse,
  CurrencyListing,
  CurrencyQuote,
  ToolRequest
} from './remote-mcp.interface';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3002;
const coinMarketApiKey = process.env.COINMARKET_API_KEY || 'demo_key';
const coinMarketApiBase = 'https://pro-api.coinmarketcap.com/v1';

// Server metrics
const startTime = Date.now();
let requestsProcessed = 0;

// Middleware
app.use(cors());
app.use(express.json());

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API key validation middleware
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  // Skip validation for status check
  if (req.method === 'GET' && req.path === '/api/status') {
    return next();
  }
  
  // Validate API key
  if (!apiKey || apiKey !== process.env.MCP_API_KEY) {
    if (process.env.NODE_ENV === 'development') {
      // Skip validation in development environment
      console.warn('Development environment: Skipping API key validation');
      return next();
    }
    return res.status(401).json({
      type: 'error',
      content: 'Unauthorized access, please provide a valid API key',
      success: false
    });
  }
  
  next();
});

/**
 * Status check endpoint
 */
app.get('/api/status', (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  const statusResponse: StatusResponse = {
    status: 'online',
    version: '1.0.0',
    capabilities: [
      'get-currency-listings', 
      'get-quotes'
    ],
    uptime,
    requestsProcessed
  };
  
  res.json(statusResponse);
});

/**
 * Capability check endpoint
 */
app.post('/api/can-handle', (req, res) => {
  const { context } = req.body;
  
  if (!context || !context.input) {
    return res.status(400).json({
      score: 0
    });
  }
  
  const input = context.input.toLowerCase();
  let score = 0;
  
  // Detect cryptocurrency queries
  if (containsCryptoQuery(input)) {
    const cryptoName = extractCryptoName(input);
    if (cryptoName) {
      score = 0.95; // High confidence
    } else {
      score = 0.6;  // Medium confidence
    }
  }
  
  const response: CanHandleResponse = { score };
  res.json(response);
});

/**
 * Check if input contains Chinese characters and set language
 */
function detectLanguage(input: string): void {
  // Check if input contains Chinese characters
  const hasChineseCharacters = /[\u4e00-\u9fa5]/.test(input);
  
  if (hasChineseCharacters) {
    process.env.LANG = 'zh_CN.UTF-8';
  } else {
    process.env.LANG = 'en_US.UTF-8';
  }
}

/**
 * Process request endpoint
 */
app.post('/api/process', async (req, res) => {
  const { context } = req.body;
  
  if (!context || !context.input) {
    return res.status(400).json(createErrorResponse('Invalid request context'));
  }
  
  try {
    requestsProcessed++;
    const input = context.input.toLowerCase();
    
    // Detect language
    detectLanguage(context.input);
    
    // If not a crypto query, return error
    if (!containsCryptoQuery(input)) {
      return res.json(createErrorResponse(
        process.env.LANG && process.env.LANG.startsWith('zh')
          ? '无法处理非加密货币相关的查询'
          : 'Unable to process non-cryptocurrency related queries'
      ));
    }
    
    // Extract crypto name
    const cryptoName = extractCryptoName(input);
    if (!cryptoName) {
      // Unable to extract crypto name, need user confirmation
      return res.json(createConfirmationRequest(
        process.env.LANG && process.env.LANG.startsWith('zh')
          ? '请提供加密货币的名称或符号'
          : 'Please provide the name or symbol of the cryptocurrency',
        process.env.LANG && process.env.LANG.startsWith('zh')
          ? '我无法确定您想查询哪种加密货币。请指定名称（例如，"比特币"）或符号（例如，"BTC"）。'
          : 'I couldn\'t determine which cryptocurrency you want to query. Please specify the name (e.g., "Bitcoin") or symbol (e.g., "BTC").'
      ));
    }

    // Determine query type
    let queryType = 'quotes';
    let queryParams: Record<string, any> = {};
    
    if (input.includes('list') || input.includes('all') || input.includes('top')) {
      queryType = 'listings';
      queryParams = { limit: 10 };
    } else {
      queryType = 'quotes';
      if (cryptoName.length <= 5 && cryptoName === cryptoName.toUpperCase()) {
        queryParams.symbol = cryptoName;
      } else {
        queryParams.slug = cryptoName.toLowerCase();
      }
    }
    
    // Get crypto data
    let cryptoData;
    let formattedContent;
    
    if (queryType === 'listings') {
      cryptoData = await getCurrencyListings(queryParams.limit);
      if (!cryptoData) {
        return res.json(createErrorResponse('Unable to fetch cryptocurrency listings, please try again later'));
      }
      formattedContent = formatListingsContent(cryptoData);
    } else {
      cryptoData = await getCurrencyQuote(queryParams);
      if (!cryptoData) {
        return res.json(createErrorResponse(`Unable to get information for ${cryptoName}, please check the name or symbol and try again`));
      }
      formattedContent = formatQuoteContent(cryptoData);
    }
    
    // Return response
    const response: MCPResponse = {
      type: 'info',
      content: formattedContent,
      success: true,
      metadata: {
        cryptoData,
        queryType,
        params: queryParams
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error processing request:', error);
    res.json(createErrorResponse(`Error processing request: ${(error as Error).message}`));
  }
});

/**
 * Handle confirmation endpoint
 */
app.post('/api/handle-confirmation', async (req, res) => {
  const { context, isConfirmed } = req.body;
  
  if (!isConfirmed) {
    return res.json({
      type: 'info',
      content: process.env.LANG && process.env.LANG.startsWith('zh')
        ? '已取消加密货币查询请求'
        : 'Cryptocurrency query request canceled',
      success: true
    });
  }
  
  try {
    // Detect language
    detectLanguage(context.input);
    
    // Extract crypto name from user confirmation input
    const input = context.input.toLowerCase();
    const cryptoName = extractCryptoName(input);
    
    if (!cryptoName) {
      return res.json(createErrorResponse(
        process.env.LANG && process.env.LANG.startsWith('zh')
          ? '无法识别加密货币名称，请使用特定名称或符号重试，例如，"比特币价格" 或 "BTC行情"'
          : 'Unable to recognize cryptocurrency name, please try again with a specific name or symbol, e.g., "Bitcoin price" or "BTC quote"'
      ));
    }
    
    // Get crypto data
    let queryParams: Record<string, any> = {};
    
    if (cryptoName.length <= 5 && cryptoName === cryptoName.toUpperCase()) {
      queryParams.symbol = cryptoName;
    } else {
      queryParams.slug = cryptoName.toLowerCase();
    }
    
    const cryptoData = await getCurrencyQuote(queryParams);
    if (!cryptoData) {
      return res.json(createErrorResponse(
        process.env.LANG && process.env.LANG.startsWith('zh')
          ? `无法获取${cryptoName}的信息，请检查名称或符号并重试`
          : `Unable to get information for ${cryptoName}, please check the name or symbol and try again`
      ));
    }
    
    // Format response content
    const formattedContent = formatQuoteContent(cryptoData);
    
    // Return response
    const response: MCPResponse = {
      type: 'info',
      content: formattedContent,
      success: true,
      metadata: {
        cryptoData,
        queryType: 'quotes',
        params: queryParams
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('Error handling confirmation:', error);
    res.json(createErrorResponse(
      process.env.LANG && process.env.LANG.startsWith('zh')
        ? `处理确认时出错: ${(error as Error).message}`
        : `Error handling confirmation: ${(error as Error).message}`
    ));
  }
});

// Tool endpoints

/**
 * Get currency listings endpoint
 */
app.post('/api/tools/get-currency-listings', async (req, res) => {
  try {
    const { limit = 10 } = req.body as ToolRequest;
    
    const listings = await getCurrencyListings(limit);
    if (!listings) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch currency listings'
      });
    }
    
    res.json({
      success: true,
      data: listings
    });
  } catch (error) {
    console.error('Error fetching currency listings:', error);
    res.status(500).json({
      success: false,
      error: `Error fetching currency listings: ${(error as Error).message}`
    });
  }
});

/**
 * Get currency quote endpoint
 */
app.post('/api/tools/get-quotes', async (req, res) => {
  try {
    const { slug, symbol, convert = 'USD' } = req.body as ToolRequest;
    
    if (!slug && !symbol) {
      return res.status(400).json({
        success: false,
        error: 'Either slug or symbol parameter is required'
      });
    }
    
    const quote = await getCurrencyQuote({ slug, symbol, convert });
    if (!quote) {
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch currency quote'
      });
    }
    
    res.json({
      success: true,
      data: quote
    });
  } catch (error) {
    console.error('Error fetching currency quote:', error);
    res.status(500).json({
      success: false,
      error: `Error fetching currency quote: ${(error as Error).message}`
    });
  }
});

/**
 * Check if input contains cryptocurrency related query
 */
function containsCryptoQuery(input: string): boolean {
  const cryptoKeywords = [
    // English keywords
    'crypto', 'cryptocurrency', 'coin', 'token', 'bitcoin', 'ethereum', 'btc', 'eth',
    'price', 'market', 'cap', 'value', 'exchange', 'listing', 'quote', 'currency',
    'blockchain', 'trading', 'market cap', 'crypto price', 'tokenomics',
    
    // Chinese keywords
    '比特币', '以太坊', '加密货币', '数字货币', '币价', '市值', '价格',
    '交易所', '行情', '虚拟货币', '区块链', '代币', '币种'
  ];
  
  return cryptoKeywords.some(keyword => input.toLowerCase().includes(keyword.toLowerCase()));
}

/**
 * Extract cryptocurrency name from input
 */
function extractCryptoName(input: string): string | null {
  // Common cryptocurrencies in English and Chinese
  const commonCryptos: { [key: string]: string } = {
    // English
    'bitcoin': 'bitcoin',
    'ethereum': 'ethereum',
    'ripple': 'ripple',
    'litecoin': 'litecoin',
    'cardano': 'cardano',
    'polkadot': 'polkadot',
    'dogecoin': 'dogecoin',
    'bnb': 'bnb',
    'usdt': 'tether',
    'solana': 'solana',
    'xrp': 'xrp',
    'luna': 'terra-luna',
    'avax': 'avalanche',
    'matic': 'polygon',
    'dot': 'polkadot',
    'link': 'chainlink',
    'btc': 'bitcoin',
    'eth': 'ethereum',
    'ltc': 'litecoin',
    'ada': 'cardano',
    'doge': 'dogecoin',
    'sol': 'solana',
    'usdc': 'usd-coin',
    
    // Chinese
    '比特币': 'bitcoin',
    '以太坊': 'ethereum',
    '以太': 'ethereum',
    '瑞波币': 'ripple',
    '莱特币': 'litecoin',
    '卡尔达诺': 'cardano',
    '波卡': 'polkadot',
    '狗狗币': 'dogecoin',
    '币安币': 'bnb',
    '泰达币': 'tether',
    '索拉纳': 'solana',
    '艾达币': 'cardano',
    '柚子': 'eos',
    '波场': 'tron'
  };
  
  // Check for common cryptos in the input
  const lowerInput = input.toLowerCase();
  for (const crypto in commonCryptos) {
    if (lowerInput.includes(crypto.toLowerCase())) {
      return commonCryptos[crypto];
    }
  }
  
  // Try to extract using regex patterns
  const patterns = [
    // English patterns
    /(?:price of|how much is|value of|quote for|info on)\s+([a-zA-Z0-9]+)/i,
    /([a-zA-Z0-9]+)\s+(?:price|value|market cap|quote)/i,
    /([A-Z]{3,5})\s+(?:token|coin)/i,
    
    // Chinese patterns
    /([a-zA-Z0-9\u4e00-\u9fa5]+)(?:价格|币价|多少钱|行情)/i,
    /(?:价格|币价|多少|行情).*?([a-zA-Z0-9\u4e00-\u9fa5]+)/i
  ];
  
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match && match[1]) {
      const extracted = match[1].toLowerCase();
      // Check if extracted term is in our common cryptos
      for (const crypto in commonCryptos) {
        if (extracted.includes(crypto.toLowerCase())) {
          return commonCryptos[crypto];
        }
      }
      return extracted;
    }
  }
  
  return null;
}

/**
 * Get currency listings from CoinMarketCap API
 */
async function getCurrencyListings(limit: number = 10): Promise<CurrencyListing[] | null> {
  try {
    const response = await axios.get(`${coinMarketApiBase}/cryptocurrency/listings/latest`, {
      headers: {
        'X-CMC_PRO_API_KEY': coinMarketApiKey
      },
      params: {
        limit,
        convert: 'USD'
      }
    });
    
    if (response.status !== 200 || !response.data || !response.data.data) {
      console.error('Error in getCurrencyListings response:', response.status, response.data);
      return null;
    }
    
    // Transform API response to our interface format
    return response.data.data.map((item: any) => ({
      id: item.id,
      name: item.name,
      symbol: item.symbol,
      slug: item.slug,
      price: item.quote.USD.price,
      market_cap: item.quote.USD.market_cap,
      volume_24h: item.quote.USD.volume_24h,
      percent_change_24h: item.quote.USD.percent_change_24h,
      percent_change_7d: item.quote.USD.percent_change_7d,
      rank: item.cmc_rank,
      last_updated: item.last_updated
    }));
  } catch (error) {
    console.error('Error fetching currency listings:', error);
    return null;
  }
}

/**
 * Get currency quote from CoinMarketCap API
 */
async function getCurrencyQuote(params: { slug?: string, symbol?: string, convert?: string }): Promise<CurrencyQuote | null> {
  try {
    const { slug, symbol, convert = 'USD' } = params;
    let endpoint;
    let queryParams: Record<string, any> = { convert };
    
    if (slug) {
      endpoint = `${coinMarketApiBase}/cryptocurrency/quotes/latest`;
      queryParams.slug = slug;
    } else if (symbol) {
      endpoint = `${coinMarketApiBase}/cryptocurrency/quotes/latest`;
      queryParams.symbol = symbol;
    } else {
      console.error('getCurrencyQuote requires either slug or symbol parameter');
      return null;
    }
    
    const response = await axios.get(endpoint, {
      headers: {
        'X-CMC_PRO_API_KEY': coinMarketApiKey
      },
      params: queryParams
    });
    
    if (response.status !== 200 || !response.data || !response.data.data) {
      console.error('Error in getCurrencyQuote response:', response.status, response.data);
      return null;
    }
    
    // Get the first result from the data object (which is a map)
    const dataId = Object.keys(response.data.data)[0];
    const item = response.data.data[dataId];
    
    if (!item) {
      console.error('No data returned for the requested cryptocurrency');
      return null;
    }
    
    // Transform API response to our interface format
    return {
      id: item.id,
      name: item.name,
      symbol: item.symbol,
      slug: item.slug,
      price: item.quote.USD.price,
      market_cap: item.quote.USD.market_cap,
      volume_24h: item.quote.USD.volume_24h,
      percent_change_1h: item.quote.USD.percent_change_1h,
      percent_change_24h: item.quote.USD.percent_change_24h,
      percent_change_7d: item.quote.USD.percent_change_7d,
      circulating_supply: item.circulating_supply,
      total_supply: item.total_supply,
      max_supply: item.max_supply,
      last_updated: item.last_updated
    };
  } catch (error) {
    console.error('Error fetching currency quote:', error);
    return null;
  }
}

/**
 * Format currency listings content for display
 */
function formatListingsContent(listings: CurrencyListing[]): string {
  const isChineseRequest = process.env.LANG && process.env.LANG.startsWith('zh');
  
  let content = isChineseRequest 
    ? `# 前 ${listings.length} 加密货币\n\n`
    : `# Top ${listings.length} Cryptocurrencies\n\n`;
    
  content += isChineseRequest
    ? `| 排名 | 名称 | 符号 | 价格 (USD) | 24h 变化率 | 市值 |\n`
    : `| Rank | Name | Symbol | Price (USD) | 24h Change | Market Cap |\n`;
    
  content += `|------|------|--------|------------|------------|------------|\n`;
  
  for (const item of listings) {
    const price = formatCurrency(item.price);
    const marketCap = formatLargeNumber(item.market_cap);
    const change24h = formatPercentage(item.percent_change_24h);
    
    content += `| ${item.rank} | ${item.name} | ${item.symbol} | ${price} | ${change24h} | ${marketCap} |\n`;
  }
  
  content += isChineseRequest
    ? `\n_最后更新时间: ${new Date().toUTCString()}_`
    : `\n_Last updated: ${new Date().toUTCString()}_`;
    
  return content;
}

/**
 * Format currency quote content for display
 */
function formatQuoteContent(quote: CurrencyQuote): string {
  const isChineseRequest = process.env.LANG && process.env.LANG.startsWith('zh');
  
  const price = formatCurrency(quote.price);
  const marketCap = formatLargeNumber(quote.market_cap);
  const volume24h = formatLargeNumber(quote.volume_24h);
  const change1h = formatPercentage(quote.percent_change_1h);
  const change24h = formatPercentage(quote.percent_change_24h);
  const change7d = formatPercentage(quote.percent_change_7d);
  
  let content = `# ${quote.name} (${quote.symbol})\n\n`;
  
  if (isChineseRequest) {
    content += `**当前价格:** ${price}\n`;
    content += `**市值:** ${marketCap}\n`;
    content += `**24小时交易量:** ${volume24h}\n\n`;
    
    content += `**价格变化:**\n`;
    content += `- 1小时: ${change1h}\n`;
    content += `- 24小时: ${change24h}\n`;
    content += `- 7天: ${change7d}\n\n`;
    
    content += `**供应量:**\n`;
  } else {
    content += `**Current Price:** ${price}\n`;
    content += `**Market Cap:** ${marketCap}\n`;
    content += `**24h Volume:** ${volume24h}\n\n`;
    
    content += `**Price Changes:**\n`;
    content += `- 1h: ${change1h}\n`;
    content += `- 24h: ${change24h}\n`;
    content += `- 7d: ${change7d}\n\n`;
    
    content += `**Supply:**\n`;
  }
  
  if (quote.circulating_supply) {
    content += isChineseRequest
      ? `- 流通供应量: ${formatLargeNumber(quote.circulating_supply)} ${quote.symbol}\n`
      : `- Circulating: ${formatLargeNumber(quote.circulating_supply)} ${quote.symbol}\n`;
  }
  if (quote.total_supply) {
    content += isChineseRequest
      ? `- 总供应量: ${formatLargeNumber(quote.total_supply)} ${quote.symbol}\n`
      : `- Total: ${formatLargeNumber(quote.total_supply)} ${quote.symbol}\n`;
  }
  if (quote.max_supply) {
    content += isChineseRequest
      ? `- 最大供应量: ${formatLargeNumber(quote.max_supply)} ${quote.symbol}\n`
      : `- Max: ${formatLargeNumber(quote.max_supply)} ${quote.symbol}\n`;
  }
  
  content += isChineseRequest
    ? `\n_最后更新时间: ${new Date(quote.last_updated).toUTCString()}_`
    : `\n_Last updated: ${new Date(quote.last_updated).toUTCString()}_`;
    
  return content;
}

/**
 * Helper function to format currency values
 */
function formatCurrency(value: number): string {
  if (value >= 1) {
    return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } else {
    return `$${value.toLocaleString('en-US', { minimumSignificantDigits: 2, maximumSignificantDigits: 6 })}`;
  }
}

/**
 * Helper function to format large numbers
 */
function formatLargeNumber(value: number): string {
  if (!value) return 'N/A';
  
  if (value >= 1e12) {
    return `$${(value / 1e12).toFixed(2)}T`;
  } else if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  } else if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`;
  } else {
    return `$${value.toLocaleString('en-US')}`;
  }
}

/**
 * Helper function to format percentages
 */
function formatPercentage(value: number): string {
  if (!value && value !== 0) return 'N/A';
  
  const formatted = value.toFixed(2);
  if (value > 0) {
    return `+${formatted}%`;
  } else {
    return `${formatted}%`;
  }
}

/**
 * Create an error response
 */
function createErrorResponse(message: string): MCPResponse {
  return {
    type: 'error',
    content: message,
    success: false
  };
}

/**
 * Create a confirmation request
 */
function createConfirmationRequest(content: string, confirmationMessage: string): MCPResponse {
  return {
    type: 'info',
    content,
    success: true,
    requireConfirmation: true,
    confirmationMessage,
    isAwaitingConfirmation: true
  };
}

// Start the server
const server = app.listen(port, () => {
  console.log(`CoinMarket MCP Server running on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

export default app; 