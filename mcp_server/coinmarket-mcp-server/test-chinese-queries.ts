/**
 * CoinMarket MCP Service Chinese Query Test Script
 * 
 * This script tests the CoinMarket MCP server's ability to handle Chinese queries
 * Run with: ts-node test-chinese-queries.ts
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

/**
 * Test the server's ability to handle a Chinese query
 */
async function testChineseQuery(input: string) {
  console.log(`\n=== Testing Chinese Query: "${input}" ===`);
  
  // First check if the server can handle this query
  try {
    const canHandleResponse = await axios.post(
      `${serverUrl}/api/can-handle`,
      {
        context: {
          sessionId: 'test-session-chinese',
          requestId: 'test-request-chinese',
          input,
          timestamp: Date.now()
        }
      },
      { headers }
    );
    
    console.log(`Can Handle Score: ${canHandleResponse.data.score}`);
    
    if (canHandleResponse.data.score > 0) {
      // Process the query
      const processResponse = await axios.post(
        `${serverUrl}/api/process`,
        {
          context: {
            sessionId: 'test-session-chinese',
            requestId: 'test-request-chinese',
            input,
            timestamp: Date.now()
          }
        },
        { headers }
      );
      
      console.log('Response Type:', processResponse.data.type);
      console.log('Response Success:', processResponse.data.success);
      console.log('Response Content:');
      console.log(processResponse.data.content);
      
      return processResponse.data.success;
    } else {
      console.log('Server cannot handle this query.');
      return false;
    }
  } catch (error: any) {
    console.error('Error testing Chinese query:', error.message);
    return false;
  }
}

/**
 * Run all Chinese query tests
 */
async function runChineseTests() {
  console.log('Starting CoinMarket MCP Chinese Query Tests');
  console.log('===========================================');
  
  // Test various Chinese queries
  await testChineseQuery('比特币现在价格多少？');
  await testChineseQuery('以太坊的当前市值是什么？');
  await testChineseQuery('显示前5名加密货币');
  await testChineseQuery('莱特币和狗狗币哪个价格更高？');
  
  console.log('\n===========================================');
  console.log('CoinMarket MCP Chinese Query Tests Completed');
}

// Run the tests
runChineseTests().catch(console.error); 