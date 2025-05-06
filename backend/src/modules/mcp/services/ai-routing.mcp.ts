import { MCPRequestContext, MCPResponse, MCPService } from '../interfaces/mcp.interface';
import { BaseMCPService } from './base-mcp.service';
import { createModuleLogger } from '../../../utils/logger';

const logger = createModuleLogger('ai-routing-mcp');

/**
 * AI Routing MCP Service
 * 
 * This service analyzes user input to determine the appropriate service
 * to handle the request. It uses AI to categorize and route requests.
 */
class AIRoutingMCPService extends BaseMCPService {
  readonly id = 'ai-routing';
  readonly name = 'AI Intent Routing Service';
  readonly description = 'Uses AI to analyze user input and route to appropriate services';
  readonly priority = 10; // 较高优先级，确保在其他服务之前评估
  readonly isSystemService = true; // 是系统服务

  constructor() {
    super();
    this.initLogger();
  }

  async initialize(): Promise<void> {
    await super.initialize();
    logger.info('AI Routing MCP Service initialized');
  }

  async shutdown(): Promise<void> {
    await super.shutdown();
    logger.info('AI Routing MCP Service shutdown');
  }

  async canHandle(context: MCPRequestContext): Promise<number> {
    // AI 路由服务总是有能力评估请求
    // 返回中等分数, 避免总是被选为主处理服务
    return 0.6;
  }

  async process(context: MCPRequestContext): Promise<MCPResponse> {
    const input = context.input.trim();
    logger.info(`AI Routing analyzing request: ${context.requestId}, input: "${input.substring(0, 50)}${input.length > 50 ? '...' : ''}"`);

    try {
      // 根据输入进行意图分析，确定适合处理此请求的服务
      // 这里简单实现一个规则引擎，实际应该接入更复杂的AI模型
      
      let targetServiceId = '';
      let confidence = 0;
      let category = '';
      let explanation = '';
      
      // 简单的规则匹配
      if (input.includes('weather') || input.includes('天气') || input.match(/温度|气温|下雨|阴晴/)) {
        targetServiceId = 'weather-service';
        confidence = 0.9;
        category = 'weather_inquiry';
        explanation = '检测到天气查询意图';
      } else if (input.match(/执行|运行|启动|command|run|exec/) && input.match(/命令|指令|process|task/)) {
        targetServiceId = 'command-analysis';
        confidence = 0.8;
        category = 'command_execution';
        explanation = '检测到命令执行意图';
      } else {
        // 没有明确匹配任何服务，将请求路由到默认的命令分析服务
        targetServiceId = 'command-analysis';
        confidence = 0.6;
        category = 'general_question';
        explanation = '无法确定明确的意图类别，交由命令分析服务处理';
        
        logger.info(`未识别到明确意图，将请求 "${input.substring(0, 30)}${input.length > 30 ? '...' : ''}" 路由到默认命令分析服务`);
        
        // 返回路由决策
        return {
          type: 'routing_decision',
          content: explanation,
          success: true,
          shouldRoute: true,
          metadata: {
            targetServiceId,
            confidence,
            intentCategory: category
          }
        };
      }
      
      // 返回路由决策
      return {
        type: 'routing_decision',
        content: explanation,
        success: true,
        shouldRoute: true,
        metadata: {
          targetServiceId,
          confidence,
          intentCategory: category
        }
      };
    } catch (error) {
      logger.error(`Error in AI routing analysis: ${error}`);
      
      // 发生错误时，也将请求路由到默认的命令分析服务
      return {
        type: 'routing_decision',
        content: `意图分析出错，交由命令分析服务处理: ${(error as Error).message}`,
        success: true,
        shouldRoute: true,
        metadata: {
          targetServiceId: 'command-analysis',
          confidence: 0.5,
          intentCategory: 'error_fallback'
        }
      };
    }
  }

  async handleConfirmation(context: MCPRequestContext, isConfirmed: boolean): Promise<MCPResponse> {
    // AI路由服务通常不需要确认
    return {
      type: 'text',
      content: '确认处理完成',
      success: true
    };
  }
}

// 导出服务实例
export const aiRoutingMCPService = new AIRoutingMCPService(); 