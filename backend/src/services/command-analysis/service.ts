import fs from 'fs';
import path from 'path';
import { 
  ICommandAnalysisService, 
  CommandAnalysisParams, 
  CommandAnalysisResult, 
  CommandType,
  CommandBypassMode,
  CommandAnalysisConfig,
  MCPServiceInfo,
  CommandPrompt
} from './interfaces';
import { 
  DEFAULT_INVALID_COMMAND_RESULT, 
  createBasicCommandResult,
  createMCPCommandResult 
} from './utils';
import { AIService } from '../ai/aiService';
import { AIFactory } from '../ai/aiFactory';
import { createModuleLogger } from '../../utils/logger';

const logger = createModuleLogger('CommandAnalysisService');

/**
 * 命令分析服务
 * 负责分析用户输入的命令，判断命令类型，并决定如何处理
 */
export class CommandAnalysisService implements ICommandAnalysisService {
  private aiService: AIService;
  private bypassCommands: string[] = [];
  private bypassMode: CommandBypassMode = CommandBypassMode.COMMON;
  private promptData: CommandPrompt | null = null;
  private config: CommandAnalysisConfig;

  /**
   * 构造函数
   */
  constructor() {
    // 初始化配置
    this.config = {
      bypassMode: CommandBypassMode.COMMON,
      bypassCommands: [],
      aiProvider: 'ollama',
      aiModel: 'gemma3:latest'
    };
    
    // 加载配置
    this.loadConfig();
    
    // 创建AI服务实例
    this.aiService = AIFactory.createDefaultService();
    
    // 加载提示词
    this.loadPromptData();
  }

  /**
   * 加载提示数据
   */
  private loadPromptData(): void {
    try {
      const promptPath = path.resolve(__dirname, 'prompt.json');
      const promptContent = fs.readFileSync(promptPath, 'utf-8');
      this.promptData = JSON.parse(promptContent) as CommandPrompt;
      logger.info('Command analysis prompt loaded successfully from JSON file');
    } catch (error) {
      logger.error('Failed to load command analysis prompt JSON:', error);
      this.promptData = null;
    }
  }

  /**
   * 加载配置
   */
  public loadConfig(): void {
    // 从环境变量加载配置
    const bypassModeStr = process.env.COMMAND_BYPASS_MODE || 'common';
    this.bypassMode = bypassModeStr as CommandBypassMode;
    
    // 加载要跳过分析的命令列表
    const bypassCommandsStr = process.env.BYPASS_COMMANDS || 'ls,cd,pwd,clear,history,echo,cat,mkdir,touch,cp,mv,date,whoami,df,du,free,ps,top,uname,hostname,ifconfig,ip';
    this.bypassCommands = bypassCommandsStr.split(',').map(cmd => cmd.trim());
    
    // 保存配置
    this.config = {
      bypassMode: this.bypassMode,
      bypassCommands: [...this.bypassCommands],
      aiProvider: process.env.DEFAULT_AI_PROVIDER || 'ollama',
      aiModel: process.env.DEFAULT_AI_MODEL || 'gemma3:latest'
    };
    
    logger.info(`Command analysis service configured with bypassMode: ${this.bypassMode}, bypassCommands count: ${this.bypassCommands.length}`);
  }

  /**
   * 分析命令并返回处理策略
   * @param params 命令分析参数
   * @returns 命令分析结果
   */
  public async analyzeCommand(params: CommandAnalysisParams): Promise<CommandAnalysisResult> {
    const { command } = params;
    
    // 检查命令是否为空
    if (!command || command.trim() === '') {
      return DEFAULT_INVALID_COMMAND_RESULT;
    }
    
    // 检查是否应该跳过AI分析
    if (this.shouldBypassAnalysis(command)) {
      return createBasicCommandResult(command);
    }
    
    // 使用AI分析命令
    try {
      logger.debug(`Analyzing command with AI: ${command}`);
      return await this.analyzeWithAI(params);
    } catch (error) {
      logger.error(`Error analyzing command: ${command}`, error);
      return this.handleParseError(error, command);
    }
  }

  /**
   * 判断命令是否在跳过列表中
   * @param command 要判断的命令
   * @returns 如果命令在bypass列表中返回true，否则返回false
   */
  public isCommandInBypassList(command: string): boolean {
    const baseCommand = this.getCommandBase(command);
    const result = this.bypassCommands.includes(baseCommand);
    if (result) {
      logger.debug(`Command "${baseCommand}" is in the bypass list`);
    }
    return result;
  }

  /**
   * 获取命令的基本部分（不包括参数）
   * @param command 完整命令
   * @returns 命令基础部分
   */
  private getCommandBase(command: string): string {
    // 去除命令中的参数，只返回命令本身
    const trimmedCommand = command.trim();
    const parts = trimmedCommand.split(' ');
    return parts[0];
  }

  /**
   * 根据配置判断是否应该跳过AI分析
   * @param command 要判断的命令
   * @returns 是否应该跳过AI分析
   */
  private shouldBypassAnalysis(command: string): boolean {
    // 如果配置为all，跳过所有命令的AI分析
    if (this.bypassMode === CommandBypassMode.ALL) {
      logger.debug('Bypassing AI analysis for all commands');
      return true;
    }
    
    // 如果配置为none，不跳过任何命令的AI分析
    if (this.bypassMode === CommandBypassMode.NONE) {
      logger.debug('Not bypassing AI analysis for any commands');
      return false;
    }
    
    // 如果配置为common，检查命令是否在跳过列表中
    return this.isCommandInBypassList(command);
  }

  /**
   * 使用AI服务分析命令
   * @param params 命令分析参数
   * @returns 命令分析结果
   */
  private async analyzeWithAI(params: CommandAnalysisParams): Promise<CommandAnalysisResult> {
    const { command, currentTerminalState, osInfo } = params;
    
    // 如果没有成功加载提示数据，使用简单的提示信息
    if (!this.promptData) {
      logger.warn('Using simplified prompt for command analysis due to missing prompt data');
      return this.analyzeWithSimplePrompt(params);
    }
    
    // 构建提示词
    const inputData = {
      command,
      currentTerminalState,
      osInfo: osInfo || { platform: 'linux' }
    };
    
    const systemPrompt = this.promptData.system + '\n' + this.promptData.instructions;
    
    // 准备包含示例的消息和规则
    let fullPrompt = `我需要分析以下命令:
    
${JSON.stringify(inputData, null, 2)}

请根据规则分析这个命令，并返回JSON格式的结果。

规则:
${Object.entries(this.promptData.rules).map(([key, value]) => `- ${value}`).join('\n')}

命令类型:
${Object.entries(this.promptData.commandTypes).map(([key, value]) => `- ${key}: ${value}`).join('\n')}

${this.promptData.formatInstructions}
`;

    // 添加示例
    if (this.promptData.examples && this.promptData.examples.length > 0) {
      fullPrompt += `\n\n这里是一些分析示例:\n`;
      for (const example of this.promptData.examples) {
        fullPrompt += `\n输入: ${JSON.stringify(example.input)}\n输出: ${JSON.stringify(example.output)}\n`;
      }
    }
    
    // 调用AI服务
    const response = await this.aiService.callAI({
      prompt: fullPrompt,
      systemPrompt: systemPrompt,
      temperature: 0.3, // 使用较低的temperature以获得更确定性的结果
    });
    
    // 解析AI响应
    return this.parseAIResponse(response.text);
  }

  /**
   * 使用简单提示分析命令（当无法加载JSON提示文件时使用）
   * @param params 命令分析参数
   * @returns 命令分析结果
   */
  private async analyzeWithSimplePrompt(params: CommandAnalysisParams): Promise<CommandAnalysisResult> {
    const { command, currentTerminalState, osInfo } = params;
    
    // 构建提示词
    const prompt = `
命令: ${command}
当前终端状态: ${currentTerminalState}
操作系统: ${osInfo?.platform || 'linux'}
${osInfo?.distribution ? `发行版: ${osInfo.distribution}` : ''}
${osInfo?.version ? `版本: ${osInfo.version}` : ''}

请分析上述命令并返回JSON格式的处理策略。需要包含以下字段:
- commandType: "basic" | "interactive" | "mcp" | "invalid"
- shouldExecute: boolean
- shouldChangeTerminalState: boolean
- newTerminalState: "normal" | "interactive" | "config"
- modifiedCommand: string
- explanation: string
- feedback: { needsFeedback: boolean, message: string }
- analysis: { commandPurpose: string, potentialIssues: string[], alternatives: string[] }
- mcpInfo (可选): { serviceName: string, serviceId?: string, params?: object, priority?: number }
`;
    
    const systemPrompt = `你是一个命令分析器，负责分析用户输入的命令。
请分析命令是基本命令、交互式命令、MCP命令还是无效命令，并决定如何处理它。
如果是交互式命令（如vim, nano等），应该将终端状态改为interactive。
如果是无效命令，应该给出修正建议。
如果是MCP命令，应提供mcpInfo对象。`;
    
    // 调用AI服务
    const response = await this.aiService.callAI({
      prompt,
      systemPrompt,
      temperature: 0.3,
    });
    
    // 解析AI响应
    return this.parseAIResponse(response.text);
  }

  /**
   * 解析AI响应为CommandAnalysisResult对象
   * @param responseText AI服务返回的文本
   * @returns 命令分析结果
   */
  private parseAIResponse(responseText: string): CommandAnalysisResult {
    try {
      // 尝试从响应文本中提取JSON
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || 
                      responseText.match(/{[\s\S]*?}/);
      
      if (!jsonMatch) {
        throw new Error('无法从AI响应中提取JSON');
      }
      
      const jsonText = jsonMatch[1] || jsonMatch[0];
      const result = JSON.parse(jsonText);
      
      // 验证结果格式
      if (!result.commandType || 
          typeof result.shouldExecute !== 'boolean' || 
          typeof result.shouldChangeTerminalState !== 'boolean' ||
          !result.newTerminalState) {
        throw new Error('AI响应的JSON格式不完整');
      }
      
      // 修正commandType类型（确保是枚举类型）
      if (result.commandType === 'mcp' && result.mcpInfo) {
        // 对于MCP类型的命令，创建标准的MCP结果
        const mcpInfo: MCPServiceInfo = {
          serviceName: result.mcpInfo.serviceName,
          serviceId: result.mcpInfo.serviceId,
          params: result.mcpInfo.params,
          priority: result.mcpInfo.priority || 5
        };
        
        // 当前MCP服务未实现，标记为不执行
        // TODO: 后续实现MCP服务后移除此限制
        logger.warn('MCP command detected but MCP service is not implemented yet');
        result.shouldExecute = false;
        result.feedback.needsFeedback = true;
        result.feedback.message = "MCP服务尚未实现，无法执行该命令";
      }
      
      return result;
    } catch (error: any) {
      logger.error('Failed to parse AI response:', error);
      throw new Error(`解析AI响应失败: ${error.message}`);
    }
  }

  /**
   * 处理解析错误，返回默认的错误结果
   * @param error 错误对象
   * @param command 原始命令
   * @returns 命令分析结果
   */
  private handleParseError(error: any, command: string): CommandAnalysisResult {
    logger.error(`Command analysis failed: ${error.message}`);
    
    // 返回默认的错误结果
    const result = { ...DEFAULT_INVALID_COMMAND_RESULT };
    result.modifiedCommand = command;
    result.feedback.message = `解析命令失败: ${command}。请检查命令是否正确或稍后重试。`;
    
    return result;
  }
}

// 导出命令分析服务实例
export const commandAnalysisService = new CommandAnalysisService(); 