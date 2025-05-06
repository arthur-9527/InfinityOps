import { createModuleLogger } from '../utils/logger';
import { MCPRegistry } from '../modules/mcp/registry/mcp.registry';
import { MCPRequestContext, MCPResponse } from '../modules/mcp/interfaces/mcp.interface';
import { v4 as uuidv4 } from 'uuid';
import { AIServiceFactory } from '../modules/ai/ai.factory';
import { AICompletionOptions } from '../modules/ai/ai.interface';

const logger = createModuleLogger('mcp-integration');

/**
 * 意图分析结果接口
 */
interface IntentAnalysisResult {
  category: string;
  recommendedService: string;
  confidence: number;
  explanation: string;
}

/**
 * MCPIntegrationService
 * 
 * This service integrates the WebSocket service with the MCP plugin system.
 * It processes incoming commands from the WebSocket and routes them to
 * the appropriate MCP service based on the command content.
 */
export class MCPIntegrationService {
  private static instance: MCPIntegrationService;
  private registry: MCPRegistry;
  private aiService = AIServiceFactory.createService();
  
  private constructor() {
    this.registry = MCPRegistry.getInstance();
  }
  
  /**
   * Get the singleton instance of MCPIntegrationService
   */
  public static getInstance(): MCPIntegrationService {
    if (!MCPIntegrationService.instance) {
      MCPIntegrationService.instance = new MCPIntegrationService();
    }
    return MCPIntegrationService.instance;
  }
  
  /**
   * 使用AI分析用户意图并处理命令
   * 这个方法先用AI分析用户的真实意图，然后根据意图选择合适的MCP服务处理
   * 
   * @param sessionId 会话ID
   * @param command 用户命令
   * @param path 当前路径
   * @param userId 用户ID（可选）
   * @param additionalContext 附加上下文（可选）
   * @returns MCP响应
   */
  public async analyzeIntentAndProcess(
    sessionId: string,
    command: string,
    path?: string,
    userId?: string,
    additionalContext: Record<string, any> = {}
  ): Promise<MCPResponse> {
    logger.info(`分析用户意图: "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}" (sessionId: ${sessionId})`);
    
    try {
      // 1. 分析用户意图
      const intentAnalysis = await this.analyzeIntent(command);
      logger.info(`意图分析结果: 类别=${intentAnalysis.category}, 推荐服务=${intentAnalysis.recommendedService}`);
      
      // 2. 使用分析结果创建增强的上下文
      const enhancedContext: Record<string, any> = {
        ...additionalContext,
        intentAnalysis: {
          category: intentAnalysis.category,
          recommendedService: intentAnalysis.recommendedService,
          confidence: intentAnalysis.confidence,
          explanation: intentAnalysis.explanation
        }
      };
      
      // 3. 处理命令，传入增强的上下文
      return await this.processCommand(
        sessionId,
        command,
        path,
        userId,
        enhancedContext
      );
    } catch (error) {
      logger.error(`AI意图分析失败: ${error}`);
      
      // 发生错误时，退回到标准处理
      return await this.processCommand(
        sessionId,
        command,
        path,
        userId,
        additionalContext
      );
    }
  }
  
  /**
   * 分析用户意图
   * 
   * @param input 用户输入
   * @returns 意图分析结果
   */
  private async analyzeIntent(input: string): Promise<IntentAnalysisResult> {
    // 构建提示词
    const prompt = `
分析以下用户输入，判断用户真正的意图，并确定最适合处理的服务类型：

用户输入: "${input}"

可能的服务类别包括：
- command_execution: 执行系统命令，如ls, cd, git等
- weather_query: 查询天气信息，如"今天天气怎么样"，"上海明天会下雨吗"
- system_info: 查询系统信息，如CPU使用率，内存状态等
- file_operation: 文件操作相关，如查找文件，创建目录等
- general_question: 一般问题回答，非特定领域的问题

请只按以下JSON格式返回你的分析，不要包含其他内容：
{
  "category": "服务类别",
  "recommendedService": "推荐的服务ID",
  "confidence": 0.95,
  "explanation": "简短解释为什么选择这个服务"
}

对于服务ID，请使用以下映射：
- command_execution -> command-analysis
- weather_query -> weather-mcp-service
- system_info -> system-info
- file_operation -> file-operation
- general_question -> command-analysis

如果无法识别用户意图，请将category设为"general_question"，recommendedService设为"command-analysis"。
`;
    
    // 调用AI服务
    const completionOptions: AICompletionOptions = {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1, // 低温度以获得更确定的结果
      maxTokens: 1024 // 限制响应长度
    };
    
    try {
      const response = await this.aiService.createCompletion(completionOptions);
      const content = response.choices[0].message.content.trim();
      
      // 尝试解析JSON响应
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : content;
      
      let result;
      try {
        result = JSON.parse(jsonStr);
      } catch (parseError) {
        logger.warn(`无法解析AI响应JSON: ${parseError}`);
        // 无法解析时返回默认值
        return {
          category: 'general_question',
          recommendedService: 'command-analysis',
          confidence: 0.5,
          explanation: '无法解析AI响应，使用默认命令分析服务'
        };
      }
      
      // 确保返回预期格式，如果无法识别则使用默认值
      return {
        category: result.category || 'general_question',
        recommendedService: result.recommendedService || 'command-analysis',
        confidence: result.confidence || 0.5,
        explanation: result.explanation || '无法确定明确意图，使用默认命令分析服务'
      };
    } catch (error) {
      logger.error(`解析AI意图分析失败: ${error}`);
      
      // 返回默认值
      return {
        category: 'general_question',
        recommendedService: 'command-analysis',
        confidence: 0.5,
        explanation: '无法确定明确意图，使用默认命令分析服务'
      };
    }
  }
  
  /**
   * Process a command using the MCP registry
   * 
   * @param sessionId The session ID
   * @param command The command to process
   * @param path The current path
   * @param userId Optional user ID
   * @param additionalContext Additional context for the request
   * @returns The response from the MCP service
   */
  public async processCommand(
    sessionId: string,
    command: string,
    path?: string,
    userId?: string,
    additionalContext: Record<string, any> = {}
  ): Promise<MCPResponse> {
    // Create a request context
    const context: MCPRequestContext = {
      sessionId,
      userId,
      requestId: uuidv4(),
      input: command,
      path,
      timestamp: Date.now(),
      additionalContext: {
        ...additionalContext
      }
    };
    
    logger.info(`Processing command through MCP: "${command.substring(0, 50)}${command.length > 50 ? '...' : ''}" (sessionId: ${sessionId})`);
    
    try {
      // Process the request through the MCP registry
      // MCP registry will:
      // 1. Ask all registered services for their confidence score
      // 2. Select the service with highest confidence
      // 3. Process the request with the selected service
      const response = await this.registry.processRequest(context);
      logger.info(`MCP processed command with type: ${response.type}, success: ${response.success}`);
      return response;
    } catch (error) {
      logger.error(`Error processing command through MCP: ${error}`);
      
      // Return an error response
      return {
        type: 'error',
        content: `处理命令失败: ${(error as Error).message}`,
        success: false
      };
    }
  }
  
  /**
   * Handle a confirmation response for a pending command
   * 
   * @param sessionId The session ID
   * @param isConfirmed Whether the command was confirmed
   * @param originalInput The original input that contained the confirmation
   * @returns The response from the MCP service
   */
  public async handleConfirmation(
    sessionId: string,
    isConfirmed: boolean,
    originalInput?: string
  ): Promise<MCPResponse> {
    // Create a confirmation context
    const context: MCPRequestContext = {
      sessionId,
      requestId: uuidv4(),
      input: isConfirmed ? 'yes' : 'no',
      timestamp: Date.now(),
      additionalContext: {
        isConfirmationResponse: true,
        confirmationValue: isConfirmed,
        originalInput
      }
    };
    
    logger.info(`Processing confirmation (${isConfirmed ? 'confirmed' : 'rejected'}) through MCP for session ${sessionId}`);
    
    try {
      // Process through the registry, which will find the service waiting for confirmation
      const response = await this.registry.processRequest(context);
      logger.info(`Confirmation processed with type: ${response.type}, success: ${response.success}`);
      return response;
    } catch (error) {
      logger.error(`Error processing confirmation through MCP: ${error}`);
      
      // Return an error response
      return {
        type: 'error',
        content: `处理确认操作失败: ${(error as Error).message}`,
        success: false
      };
    }
  }
}

// Export a singleton instance
export const mcpIntegrationService = MCPIntegrationService.getInstance(); 