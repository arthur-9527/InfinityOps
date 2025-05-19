import { createModuleLogger } from '../../utils/logger';
import { resultConfig } from './config';
import { AnalysisResult } from './types';
import { terminalAIService } from '../ai/aiFactory';

const logger = createModuleLogger('result');

export class ResultService {
  private static instance: ResultService;
  private aiService = terminalAIService;

  private constructor() {}

  public static getInstance(): ResultService {
    if (!ResultService.instance) {
      ResultService.instance = new ResultService();
    }
    return ResultService.instance;
  }

  /**
   * 分析命令执行结果
   * @param sessionId 会话ID
   * @param data 命令执行输出
   * @param aiOutput AI输出内容
   */
  public async analyzeResult( data: string, aiOutput: string): Promise<AnalysisResult> {
    try {
      // 检查是否是命令未找到错误
      const isCommandNotFound = this.isCommandNotFound(data);
      if(isCommandNotFound) {
        logger.info(`命令未找到错误: ${data}`);
      }
      logger.info(`[DATA] ${data}`);
      logger.info(`[AI OUTPUT] ${aiOutput}`);
      // 构建AI分析提示
      const prompt = this.buildAnalysisPrompt(
        isCommandNotFound ? 'null' : data,
        aiOutput
      );
      
      // 使用AI进行分析
      const aiResponse = await this.generateAiResponse(prompt);
      
      // 解析AI响应
      const analysisResult = this.parseAiResponse(aiResponse);
      return analysisResult;
    } catch (error) {
      logger.error(`Error analyzing result: ${error}`);
      return {
        type: 'error',
        data: 'null',
        details: (error as Error).message
      };
    }
  }

  /**
   * 检查是否是命令未找到错误
   */
  private isCommandNotFound(output: string): boolean {
    return output.toLowerCase().includes('command not found') ||
           output.toLowerCase().includes('未找到命令');
  }

  /**
   * 构建AI分析提示
   */
  private buildAnalysisPrompt(data: string, aiOutput: string): string {
    let prompt = `你是一个专业的总结分析师，擅长根据输入，总结出相关信息，并给出相关建议。
    输入包含2个部分：
    1. 服务器返回执行命令信息，这里我们称之为data。
    2. MCP服务器输出信息，这里我们称之为aiOutput。
    返回JSON的data只有2种情况，一种是原始data输入，一种是'null'.不会有第三种结果。请千万不要将aiOutput返回给data，
    比如：
    输入data: 'null'
    输入aiOutput: [{"timestamp":1747642235438,"data":"{\"service\":\"add\",\"confidence\":0.95,\"parameters\":{\"a\":1,\"b\":2},\"mcpResult\":[{\"type\":\"text\",\"text\":\"1 + 2 = 3\"}]}"}]
    则返回：{"type":"success","data":"null","details":"计算结果：1 + 2 = 3"}
    千万不要将data和aiOutput混合再一起返回到JSON中的'data'字段，绝对不要将aiOutput中的信息返回给JSON中的’data’字段，这一点非常重要，请务必遵守。
    总结结果与相关建议请尽量干练，不需要回复置信度，以一个人类的角度，以助理的形式回复。
    比如看到总结天气信息，只需要回复相关天气信息，并根据天气信息给予建议\n\n`;
    
    if (data) {
      prompt += `服务器返回执行命令信息\n${data}\n\n`;
    }
    
    prompt += `MCP服务器输出信息：\n${aiOutput}\n\n`;
    
    prompt += `请严格按照以下JSON格式提供分析结果，不要添加任何其他内容：
{
  "type": "success|error|info|warning",
  "data": "data原始输入|null",
  "details": "总结结果与相关建议",
}

注意：
1. 必须严格按照上述JSON格式输出，不要添加任何其他内容
2. 如果发现错误，请提供具体的错误分析和解决建议
3.（!!!非常重要!!!）data仅返回原始data输入或者'null'。若原始输入为"null"，则data返回必须为null否则返回原始的服务器执行命令信息。
4.（!!!非常重要!!!）请将data与aiOutput分开，JSON中返回的data只有2种情况，一种是原始data输入，另一种是'null'。千万不要将aiOutput放在data中返回，也不要将data和aiOutput字符串混合在一起返回，这一点非常重要，请务必遵守。
5.（!!!非常重要!!!）若data为计算结果，比如：8+6=14，请务必在details中回复'8+6=14'或者'14'。不要回复你自己的总结，不要回复其他乱七八糟的东西。这一点非常重要。
6. 请确保输出是有效的JSON格式，不要包含任何非JSON内容`;

    return prompt;
  }

  /**
   * 生成AI响应
   */
  private async generateAiResponse(prompt: string): Promise<string> {
    try {
      const response = await this.aiService.callAI({
        prompt,
        systemPrompt: '你是一个专业的命令执行结果分析助手。请仔细分析命令执行结果和AI输出，提供准确的分析和建议。你必须严格按照指定的JSON格式输出，不要添加任何其他内容。',
        temperature: 0.7
      });

      return response.text;
    } catch (error) {
      logger.error(`Error generating AI response: ${error}`);
      throw new Error(`AI响应生成失败: ${(error as Error).message}`);
    }
  }

  /**
   * 解析AI响应
   */
  private parseAiResponse(response: string): AnalysisResult {
    try {
      // 清理响应文本，只保留JSON部分
      logger.info(`[RESPONSE] ${response}`);
      const cleanedResponse = response.replace(/```json\n?|\n?```/g, '').trim();
      
      // 尝试从响应中提取JSON
      const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error(resultConfig.errors.jsonExtractionFailed);
      }

      const result = JSON.parse(jsonMatch[0]);
      
      // 严格验证结果格式
      if (!result.type || !result.data || !result.details) {
        throw new Error(resultConfig.errors.incompleteFormat);
      }

      // 确保类型是有效的
      if (!['success', 'error', 'info', 'warning'].includes(result.type)) {
        throw new Error('Invalid type value. Must be one of: success, error, info, warning');
      }

      // 确保data字段是字符串或null
      if (result.data !== null && typeof result.data !== 'string') {
        throw new Error('Invalid data value. Must be string or null');
      }

      // 确保details是字符串
      if (typeof result.details !== 'string') {
        throw new Error('Invalid details value. Must be string');
      }

      return {
        type: result.type as 'success' | 'error' | 'info' | 'warning',
        data: result.data,
        details: result.details
      };
    } catch (error) {
      logger.error(`Error parsing AI response: ${error}`);
      return {
        type: 'error',
        data: null,
        details: (error as Error).message
      };
    }
  }
} 