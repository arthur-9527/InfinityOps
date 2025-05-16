import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import { analyzeUserInput, fallbackAnalysis, ToolAnalysisResult } from './aiService.js';
import dotenv from 'dotenv';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 加载环境变量
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// 定义结果类型
interface ToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

// 定义工具信息类型
interface ToolInfo {
  name: string;
  description: string;
  parameters?: any;
  serverName: string;
}

// 创建和管理MCP客户端
class MCPClientManager {
  clients: Map<string, { client: Client, transport: StdioClientTransport }> = new Map();
  config: any;
  availableTools: Map<string, ToolInfo> = new Map();
  toolsList: ToolInfo[] = [];

  constructor(configPath: string) {
    this.config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }

  async connectServer(serverName: string) {
    if (this.clients.has(serverName)) {
      return this.clients.get(serverName)!.client;
    }

    const serverConfig = this.config.mcpServers[serverName];
    if (!serverConfig) {
      throw new Error(`未找到服务器配置: ${serverName}`);
    }

    console.log(`正在连接到服务器: ${serverName}...`);
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
    });

    const client = new Client({
      name: 'Multi-Server Client',
      version: '1.0.0',
    });

    await client.connect(transport);
    console.log(`已连接到服务器: ${serverName}`);

    this.clients.set(serverName, { client, transport });
    
    // 获取并存储该服务器的工具
    await this.loadServerTools(serverName, client);
    
    return client;
  }
  
  async loadServerTools(serverName: string, client: Client) {
    const toolsResult = await client.listTools();
    for (const tool of toolsResult.tools) {
      const toolInfo = {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema,
        serverName
      };
      this.availableTools.set(tool.name, toolInfo);
      this.toolsList.push(toolInfo);
    }
  }

  async disconnectAll() {
    for (const [serverName, { transport }] of this.clients.entries()) {
      transport.close();
      console.log(`断开服务器连接: ${serverName}`);
    }
    this.clients.clear();
  }
  
  /**
   * 通过AI分析用户输入并自动调用适当的MCP服务
   */
  async processUserInput(input: string): Promise<string> {
    try {
      console.log('正在分析用户请求...');
      
      // 使用AI分析用户输入
      const analysis = await analyzeUserInput(input, this.toolsList);
      console.log('分析结果:', JSON.stringify(analysis, null, 2));
      
      // 如果无法确定工具
      if (analysis.serviceType === 'unknown' || !analysis.recommendedTool) {
        return "抱歉，我无法理解您的请求。请尝试更明确地描述您的需求。";
      }
      
      // 获取推荐的工具
      const tool = this.availableTools.get(analysis.recommendedTool);
      if (!tool) {
        return `无法找到合适的工具来处理您的请求。`;
      }
      
      // 准备参数
      const args = analysis.parameters || {};
      
      // 调用工具
      console.log(`调用工具: ${tool.name}，参数:`, args);
      const result = await this.callTool(tool.name, args);
      
      // 格式化响应
      let response = result.content[0].text;
      
      // 根据服务类型进行自定义格式化
      if (tool.serverName === 'calculator-mcp') {
        response = `计算结果: ${response}`;
      } else if (tool.serverName === 'weather-mcp') {
        if (tool.name === 'list_chinese_cities') {
          response = `支持的城市列表:\n${response}`;
        } else {
          response = `天气信息: ${response}`;
        }
      }
      
      return response;
    } catch (error) {
      console.error('处理用户输入出错:', error);
      return `处理请求时出错: ${error}`;
    }
  }
  
  async callTool(toolName: string, args: any) {
    const tool = this.availableTools.get(toolName);
    if (!tool) {
      throw new Error(`未找到工具: ${toolName}`);
    }
    
    const client = await this.connectServer(tool.serverName);
    return await client.callTool({
      name: toolName,
      arguments: args
    }) as ToolResult;
  }
}

// 创建读取用户输入的接口
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// 读取用户输入的函数
function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  try {
    console.log('欢迎使用智能 MCP 助手');
    console.log('您可以直接输入自然语言请求，系统将自动分析并调用相应的服务');
    console.log('示例:');
    console.log('- "北京今天的天气怎么样？"');
    console.log('- "帮我计算一下 23 加 45 等于多少"');
    console.log('- "上海温度如何？"');
    console.log('- "15乘以7"');
    console.log('输入 "退出" 或 "exit" 结束程序\n');
    
    // 读取配置文件
    const configPath = path.resolve(__dirname, '../config.json');
    const clientManager = new MCPClientManager(configPath);
    
    // 连接所有服务器并获取工具列表
    console.log('正在初始化，连接所有配置的服务器...');
    
    for (const serverName of Object.keys(clientManager.config.mcpServers)) {
      await clientManager.connectServer(serverName);
    }
    
    console.log('\n系统就绪，您现在可以直接输入您的请求\n');
    
    // 创建命令行交互界面
    const rl = createInterface();
    
    let running = true;
    while (running) {
      const userInput = await question(rl, '> ');
      
      // 检查是否退出
      if (['exit', 'quit', '退出', '离开'].includes(userInput.toLowerCase())) {
        running = false;
        continue;
      }
      
      if (userInput.trim() === '') {
        continue;
      }
      
      // 处理用户输入
      console.log('正在处理您的请求...');
      const response = await clientManager.processUserInput(userInput);
      console.log('\n' + response + '\n');
    }
    
    rl.close();
    
    // 断开所有连接
    await clientManager.disconnectAll();
    console.log('已关闭所有连接，感谢使用！');
    
  } catch (error) {
    console.error('出错了:', error);
    process.exit(1);
  }
}

main(); 