import { createModuleLogger } from '../../utils/logger';
import { AIFactory } from '../ai/aiFactory';
import type { AIProvider } from '../ai/aiService';
import { MCPClientService } from '../mcp/mcpClientService';
import path from 'path';
import { fileURLToPath } from 'url';

const logger = createModuleLogger('intent');

interface IntentAnalysis {
  service: string;
  confidence: number;
  parameters?: Record<string, any>;
}

interface MCPResponse {
  success: boolean;
  result: any;
  error?: string;
}

export class IntentService {
  private aiService;
  private mcpClient: MCPClientService;
  private availableTools: string = 'No tools available';
  private initialized: boolean = false;

  constructor() {
    // 使用环境变量中配置的AI提供商和模型
    const provider = (process.env.INTENT_AI_PROVIDER || 'ollama') as AIProvider;
    const model = process.env.INTENT_AI_MODEL || 'gemma3:latest';
    
    logger.info(`Initializing IntentService with provider: ${provider}, model: ${model}`);
    
    this.aiService = AIFactory.createService(provider, model);
    
    // 初始化 MCP 客户端
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const configPath = path.join(__dirname, '../mcp/config.json');
    this.mcpClient = new MCPClientService(configPath);
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // 等待 MCP 客户端初始化完成
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 初始化可用工具信息
      await this.initializeAvailableTools();
      
      this.initialized = true;
      logger.info('IntentService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize IntentService:', error);
      throw error;
    }
  }

  private async initializeAvailableTools() {
    try {
      const tools = this.mcpClient.getAvailableTools();
      
      // 打印详细的工具信息
      logger.debug('=== Available MCP Tools ===');
      tools.forEach((tool, index) => {
        logger.debug(`\nTool #${index + 1}:`);
        logger.debug(`Name: ${tool.name}`);
        logger.debug(`Description: ${tool.description}`);
        logger.debug(`Server: ${tool.serverName}`);
        logger.debug('Parameters:');
        logger.debug(JSON.stringify(tool.parameters, null, 2));
        logger.debug('------------------------');
      });
      logger.debug('========================\n');

      // 构建工具描述字符串
      this.availableTools = tools.map(tool => {
        return `Service: ${tool.name}
Description: ${tool.description}
Parameters: ${JSON.stringify(tool.parameters, null, 2)}
Server: ${tool.serverName}
---`;
      }).join('\n\n');

      logger.info(`Loaded ${tools.length} MCP tools`);
    } catch (error) {
      logger.error('Failed to initialize available tools:', error);
      this.availableTools = 'No tools available';
    }
  }

  private parseAIResponse(response: string): IntentAnalysis {
    try {
      // 尝试直接解析
      return JSON.parse(response);
    } catch (error) {
      // 如果直接解析失败，尝试提取 JSON 部分
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[1]);
        } catch (innerError) {
          logger.error(`Failed to parse extracted JSON: ${jsonMatch[1]}`);
          throw new Error('Failed to parse extracted JSON');
        }
      }
      
      // 如果找不到 JSON 块，尝试清理响应文本
      const cleanedResponse = response
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();
      
      try {
        return JSON.parse(cleanedResponse);
      } catch (finalError) {
        logger.error(`Failed to parse cleaned response: ${cleanedResponse}`);
        throw new Error('Failed to parse AI response');
      }
    }
  }

  async analyzeIntent(userInput: string): Promise<MCPResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      logger.info(`Analyzing intent for input: ${userInput}`);

      const prompt = `Analyze the following user input and determine which MCP service should handle it.
Available MCP services and their capabilities:

${this.availableTools}

Return the response in JSON format with the following structure:
{
  "service": "service_name",  // Only specify if you are highly confident about the service
  "confidence": confidence_score (0-1),  // Must be >= 0.8 to proceed with service call
  "parameters": {
    // parameters should match the service's parameter schema exactly
  }
}

Important rules:
1. If you cannot determine the intent with high confidence (>= 0.8), set service to null
2. Only return parameters if you are certain about their values
3. Do not make assumptions about parameter values
4. If the input is unclear or ambiguous, return null for service

User input: ${userInput}`;

      const response = await this.aiService.callAI({
        prompt,
        systemPrompt: 'You are an intent analysis AI that determines which MCP service should handle user requests. You must be extremely precise and conservative in your analysis. Only recommend a service if you are highly confident about the user\'s intent. If there is any ambiguity or uncertainty, return null for the service. Return only the JSON response without any markdown formatting.',
        temperature: 0.1 // 使用非常低的温度以获得最确定性的结果
      });
      
      try {
        const intentResult = this.parseAIResponse(response.text);
        logger.info(`Intent analysis result: ${JSON.stringify(intentResult)}`);

        // 如果没有服务或置信度不够高，返回无法确定意图
        if (!intentResult.service || intentResult.confidence < 0.8) {
          return {
            success: false,
            result: null,
            error: 'Unable to determine the appropriate service with high confidence'
          };
        }

        // 获取工具信息
        const toolInfo = this.mcpClient.getToolInfo(intentResult.service);
        if (!toolInfo) {
          return {
            success: false,
            result: null,
            error: `Service not found: ${intentResult.service}`
          };
        }

        // 验证参数是否完整
        if (!intentResult.parameters || Object.keys(intentResult.parameters).length === 0) {
          return {
            success: false,
            result: null,
            error: 'Missing required parameters for the service'
          };
        }

        // 调用 MCP 服务
        const mcpResult = await this.mcpClient.callTool(intentResult.service, intentResult.parameters);

        // 整合 MCP 服务的结果
        return {
          success: true,
          result: {
            service: intentResult.service,
            confidence: intentResult.confidence,
            parameters: intentResult.parameters,
            mcpResult: mcpResult.content
          }
        };

      } catch (error) {
        logger.error(`Failed to parse AI response: ${response.text}`);
        throw new Error('Failed to parse AI response');
      }
    } catch (error) {
      logger.error(`Error analyzing intent: ${error}`);
      return {
        success: false,
        result: null,
        error: `Error analyzing intent: ${(error as Error).message}`
      };
    }
  }
} 