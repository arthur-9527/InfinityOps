/**
 * CoinMarket MCP Service Test Script
 * 
 * This script tests the CoinMarket MCP server endpoints
 * Run with: ts-node test-coinmarket-mcp.ts
 */

import axios from 'axios';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Configuration
const serverUrl = process.env.COINMARKET_MCP_URL || 'http://localhost:5002';
const apiKey = process.env.MCP_API_KEY || 'test-api-key';

// Headers with API key
const headers = {
  'Content-Type': 'application/json',
  'X-API-Key': apiKey
};

// Test functions
async function testStatus() {
  console.log('\n=== Testing Status Endpoint ===');
  try {
    const response = await axios.get(`${serverUrl}/api/status`);
    console.log('Status Response:', JSON.stringify(response.data, null, 2));
    return true;
  } catch (error: any) {
    console.error('Error testing status endpoint:', error.message);
    return false;
  }
}

async function testCanHandle(input: string) {
  console.log(`\n=== Testing Can Handle Endpoint with: "${input}" ===`);
  try {
    const response = await axios.post(
      `${serverUrl}/api/can-handle`,
      {
        context: {
          sessionId: 'test-session',
          requestId: 'test-request',
          input,
          timestamp: Date.now()
        }
      },
      { headers }
    );
    console.log('Can Handle Response:', JSON.stringify(response.data, null, 2));
    return response.data.score > 0;
  } catch (error: any) {
    console.error('Error testing can-handle endpoint:', error.message);
    return false;
  }
}

async function testProcess(input: string) {
  console.log(`\n=== Testing Process Endpoint with: "${input}" ===`);
  try {
    const response = await axios.post(
      `${serverUrl}/api/process`,
      {
        context: {
          sessionId: 'test-session',
          requestId: 'test-request',
          input,
          timestamp: Date.now()
        }
      },
      { headers }
    );
    console.log('Process Response Type:', response.data.type);
    console.log('Process Response Success:', response.data.success);
    console.log('Process Response Content (snippet):');
    console.log(response.data.content.substring(0, 300) + '...');
    return response.data.success;
  } catch (error: any) {
    console.error('Error testing process endpoint:', error.message);
    return false;
  }
}

async function testToolEndpoint(tool: string, params: any) {
  console.log(`\n=== Testing Tool Endpoint: ${tool} ===`);
  try {
    const response = await axios.post(
      `${serverUrl}/api/tools/${tool}`,
      params,
      { headers }
    );
    console.log('Tool Response Success:', response.data.success);
    console.log('Tool Response Data Sample:');
    if (Array.isArray(response.data.data)) {
      console.log(`Received ${response.data.data.length} items. First item:`);
      console.log(JSON.stringify(response.data.data[0], null, 2));
    } else {
      console.log(JSON.stringify(response.data.data, null, 2));
    }
    return response.data.success;
  } catch (error: any) {
    console.error(`Error testing ${tool} endpoint:`, error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log('Starting CoinMarket MCP Server Tests');
  console.log('==================================');
  
  // Test status endpoint
  const statusOk = await testStatus();
  if (!statusOk) {
    console.error('Status endpoint test failed. Aborting further tests.');
    return;
  }

  // Test can-handle endpoint with various inputs
  await testCanHandle('What is the price of Bitcoin?');
  await testCanHandle('Show me the top 10 cryptocurrencies');
  await testCanHandle('What is the weather like in Beijing?'); // Should have low score
  
  // Test process endpoint with cryptocurrency queries
  await testProcess('What is the price of Bitcoin?');
  await testProcess('Show me the top 10 cryptocurrencies by market cap');
  
  // Test tool endpoints
  await testToolEndpoint('get-currency-listings', { limit: 5 });
  await testToolEndpoint('get-quotes', { symbol: 'BTC' });
  
  console.log('\n==================================');
  console.log('CoinMarket MCP Server Tests Completed');
}

// Run the tests
runTests().catch(console.error); 