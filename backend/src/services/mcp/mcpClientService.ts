import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Define result type
interface ToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
}

// Define tool info type
interface ToolInfo {
  name: string;
  description: string;
  parameters?: any;
  serverName: string;
}

export class MCPClientService {
  private clients: Map<string, { client: Client; transport: StdioClientTransport }> = new Map();
  private config: any;
  private availableTools: Map<string, ToolInfo> = new Map();
  private toolsList: ToolInfo[] = [];

  constructor(configPath: string) {
    this.config = JSON.parse(readFileSync(configPath, 'utf8'));
    // 初始化时连接所有服务器
    this.initialize();
  }

  private async initialize() {
    try {
      // 连接所有配置的服务器
      const serverNames = Object.keys(this.config.mcpServers);
      for (const serverName of serverNames) {
        try {
          await this.connectServer(serverName);
        } catch (error) {
          console.error(`Failed to connect to server ${serverName}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to initialize MCP client:', error);
    }
  }

  async connectServer(serverName: string): Promise<Client> {
    if (this.clients.has(serverName)) {
      return this.clients.get(serverName)!.client;
    }

    const serverConfig = this.config.mcpServers[serverName];
    if (!serverConfig) {
      throw new Error(`Server configuration not found: ${serverName}`);
    }

    console.log(`Connecting to server: ${serverName}...`);
    const transport = new StdioClientTransport({
      command: serverConfig.command,
      args: serverConfig.args || [],
    });

    const client = new Client({
      name: 'InfinityOps MCP Client',
      version: '1.0.0',
    });

    await client.connect(transport);
    console.log(`Connected to server: ${serverName}`);

    this.clients.set(serverName, { client, transport });
    
    // Load and store server tools
    await this.loadServerTools(serverName, client);
    
    return client;
  }

  private async loadServerTools(serverName: string, client: Client): Promise<void> {
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

  async disconnectAll(): Promise<void> {
    for (const [serverName, { transport }] of this.clients.entries()) {
      transport.close();
      console.log(`Disconnected from server: ${serverName}`);
    }
    this.clients.clear();
  }

  async callTool(toolName: string, args: any): Promise<ToolResult> {
    const tool = this.availableTools.get(toolName);
    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }
    
    const client = await this.connectServer(tool.serverName);
    return await client.callTool({
      name: toolName,
      arguments: args
    }) as ToolResult;
  }

  getAvailableTools(): ToolInfo[] {
    return this.toolsList;
  }

  getToolInfo(toolName: string): ToolInfo | undefined {
    return this.availableTools.get(toolName);
  }
} 