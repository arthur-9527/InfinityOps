import { MCPClientService } from '../services/mcp/mcpClientService.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testMCPClient() {
  try {
    console.log('Starting MCP client test...');
    
    // Initialize MCP client service
    const configPath = resolve(__dirname, '../services/mcp/config.json');
    const mcpService = new MCPClientService(configPath);
    
    // Test calculator service
    console.log('\nTesting calculator service...');
    await mcpService.connectServer('calculator-mcp');
    
    // Test basic calculation
    console.log('Testing addition...');
    const addResult = await mcpService.callTool('add', { a: 2, b: 3 });
    console.log('Addition result:', addResult.content[0].text);
    
    console.log('\nTesting multiplication...');
    const multiplyResult = await mcpService.callTool('multiply', { a: 4, b: 5 });
    console.log('Multiplication result:', multiplyResult.content[0].text);
    
    // Test weather service
    console.log('\nTesting weather service...');
    await mcpService.connectServer('weather-mcp');
    
    // Test getting weather for Beijing
    console.log('Testing Beijing weather...');
    const beijingWeatherResult = await mcpService.callTool('beijing_weather', {});
    console.log('Beijing weather result:', beijingWeatherResult.content[0].text);
    
    // Test getting weather for Shanghai
    console.log('\nTesting Shanghai weather...');
    const shanghaiWeatherResult = await mcpService.callTool('city_weather', { 
      city: 'shanghai',
      type: 'now'
    });
    console.log('Shanghai weather result:', shanghaiWeatherResult.content[0].text);
    
    // Test listing available cities
    console.log('\nTesting city list...');
    const citiesResult = await mcpService.callTool('list_chinese_cities', {});
    console.log('Available cities:', citiesResult.content[0].text);
    
    // Get available tools
    console.log('\nAvailable tools:');
    const tools = mcpService.getAvailableTools();
    tools.forEach(tool => {
      console.log(`- ${tool.name} (${tool.serverName}): ${tool.description}`);
    });
    
    // Cleanup
    await mcpService.disconnectAll();
    console.log('\nTest completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testMCPClient(); 