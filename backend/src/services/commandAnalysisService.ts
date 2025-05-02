import { AIServiceFactory } from '../modules/ai/ai.factory';
import { AICompletionOptions, AIMessage } from '../modules/ai/ai.interface';
import { createModuleLogger } from '../utils/logger';
import dotenv from 'dotenv';

dotenv.config();

const logger = createModuleLogger('command-analysis');

// AI系统提示词
const SYSTEM_PROMPT = `你是集成在名为InfinityOps的终端环境中的AI助手。
你的主要功能是：
1. 分析用户命令，判断它们是标准的bash命令还是对AI的请求。
2. 对于bash命令：确定它们是应该直接执行还是需要解释或修改。
3. 对于AI请求：基于你的知识提供有用且准确的回答。

!!!!重要!!!!
你必须按照以下结构JSON格式返回数据：
{
  "type": "bash_execution" | "ai_response",
  "content": "你的详细响应或命令解释",
  "success": true | false,
  "command": "要执行的命令（如适用）",
  "shouldExecute": true | false,
  "requireConfirmation": true | false
}

不要在JSON结构外包含任何文本、解释或格式。
不要使用markdown、XML标签或任何其他格式。
只返回JSON对象，不要返回其他内容。
请务必按照JSON格式返回数据，不要返回其他内容。

对于bash_execution类型：
- 如果命令应该执行，设置shouldExecute为true
- 如果命令可能有危险或需要修改，设置shouldExecute为false
- 当shouldExecute为false时，在content字段中提供替代方案或解释
- 对于有风险的命令，设置requireConfirmation为true，这将提示用户确认是否执行

对于ai_response类型：
- 在content字段中提供你的回答
- command字段应包含原始用户查询
- shouldExecute应始终为false
- requireConfirmation应始终为false

示例：
1. 如果用户输入"ls -la"，回答：{"type":"bash_execution","content":"","success":true,"command":"ls -la","shouldExecute":true,"requireConfirmation":false}
2. 如果用户输入"rm -rf /"，回答：{"type":"bash_execution","content":"这个命令很危险，它会删除根目录中的所有文件。","success":false,"command":"rm -rf /","shouldExecute":false,"requireConfirmation":true}
3. 如果用户问"如何查看磁盘空间？"，回答：{"type":"ai_response","content":"你可以使用'df'命令查看磁盘空间。例如，'df -h'以人类可读格式显示磁盘使用情况。","success":true,"command":"如何查看磁盘空间？","shouldExecute":false,"requireConfirmation":false}`;

// 安全分析的专门提示词
const SECURITY_PROMPT = `你是集成在InfinityOps终端环境中专注于安全的AI助手。
你的主要关注点是安全，优先事项如下：
1. 识别可能损害系统的潜在有害命令
2. 为有风险的命令建议更安全的替代方案
3. 教育用户关于安全最佳实践

重要提示：你必须只返回符合以下结构的有效JSON：
{
  "type": "bash_execution" | "ai_response",
  "content": "你的详细响应或命令解释",
  "success": true | false,
  "command": "要执行的命令（如适用）",
  "shouldExecute": true | false,
  "securityRisk": "none" | "low" | "medium" | "high" | "critical",
  "requireConfirmation": true | false
}

不要在JSON结构外包含任何文本、解释或格式。
不要使用markdown、XML标签或任何其他格式。
只返回JSON对象，不要返回其他内容。

对这些情况要特别谨慎：
- 删除文件或目录的命令
- 修改系统配置文件的命令
- 更改权限的命令
- 从互联网下载并执行内容的命令
- 带有sudo或root权限的命令

对于任何中等或更高安全风险的命令，设置shouldExecute为false并解释风险。
对于低或中等风险的命令，设置requireConfirmation为true，这将提示用户确认是否执行。
对于高或严重风险的命令，设置requireConfirmation为true，即使shouldExecute为false。`;

// 不需要AI分析的常见命令列表
// 可以通过BYPASS_COMMANDS环境变量覆盖
const DEFAULT_BYPASS_COMMANDS = [
  'ls', 'cd', 'pwd', 'clear', 'history', 'echo', 'cat', 'mkdir', 
  'touch', 'cp', 'mv', 'date', 'whoami', 'df', 'du', 'free',
  'ps', 'top', 'uname', 'hostname', 'ifconfig', 'ip'
];

// 应该始终通过AI分析的命令前缀
// （即使主命令在绕过列表中）
const ALWAYS_ANALYZE_PREFIXES = [
  'sudo', 'rm', '>', '>>', '|', ';', '&&', '||'
];

// 从环境变量解析绕过命令（如果可用）
function getBypassCommands(): string[] {
  const envBypassCommands = process.env.BYPASS_COMMANDS;
  if (envBypassCommands) {
    return envBypassCommands.split(',').map(cmd => cmd.trim());
  }
  return DEFAULT_BYPASS_COMMANDS;
}

// 从环境变量获取绕过模式
function getBypassMode(): 'none' | 'common' | 'all' {
  const mode = process.env.COMMAND_BYPASS_MODE || 'common';
  if (mode === 'none' || mode === 'all') {
    return mode;
  }
  return 'common';
}

export interface CommandAnalysisResult {
  type: 'bash_execution' | 'ai_response';
  content: string;
  success: boolean;
  command?: string;
  shouldExecute?: boolean;
  securityRisk?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  bypassedAI?: boolean;
  requireConfirmation?: boolean;
  confirmationMessage?: string;
  isAwaitingConfirmation?: boolean;
}

export class CommandAnalysisService {
  private aiService = AIServiceFactory.createService();
  private bypassCommands: string[];
  private bypassMode: 'none' | 'common' | 'all';
  private pendingRiskyCommands: Map<string, CommandAnalysisResult> = new Map();

  constructor() {
    this.bypassCommands = getBypassCommands();
    this.bypassMode = getBypassMode();
    logger.info(`命令分析服务初始化，绕过模式: ${this.bypassMode}`);
    if (this.bypassMode === 'common') {
      logger.info(`绕过命令列表: ${this.bypassCommands.join(', ')}`);
    }
  }

  /**
   * 判断命令是否应该绕过AI分析
   */
  private shouldBypassAI(command: string): boolean {
    // 如果绕过模式为none，总是使用AI
    if (this.bypassMode === 'none') {
      return false;
    }
    
    // 如果绕过模式为all，跳过所有命令的AI分析
    if (this.bypassMode === 'all') {
      return true;
    }
    
    // 对于common模式，检查是否是可以跳过AI的简单命令
    // 移除前导空格并获取基本命令
    const trimmedCommand = command.trim();
    const baseCommand = trimmedCommand.split(' ')[0];
    
    // 如果命令包含任何应该始终分析的前缀，不绕过
    for (const prefix of ALWAYS_ANALYZE_PREFIXES) {
      if (trimmedCommand.includes(prefix)) {
        return false;
      }
    }
    
    // 检查基本命令是否在绕过列表中
    return this.bypassCommands.includes(baseCommand);
  }

  /**
   * 检查输入是否是对待确认命令的响应
   * @param input 用户输入
   * @returns 如果是确认响应，返回处理后的分析结果；否则返回null
   */
  checkConfirmationResponse(input: string): CommandAnalysisResult | null {
    const trimmedInput = input.trim().toLowerCase();
    
    // 如果没有待确认的命令，返回null
    if (this.pendingRiskyCommands.size === 0) {
      return null;
    }
    
    // 获取最近的待确认命令
    const lastCommandKey = Array.from(this.pendingRiskyCommands.keys()).pop();
    if (!lastCommandKey) {
      return null;
    }
    
    const result = this.pendingRiskyCommands.get(lastCommandKey);
    if (!result) {
      return null;
    }
    
    // 检查响应是否为y/n确认
    // 支持直接在提示后面输入y/n (如 "是否执行此命令? (y/n) y")
    const normalizedInput = this.extractConfirmationResponse(trimmedInput);
    
    if (normalizedInput === 'y' || normalizedInput === 'yes') {
      // 用户确认执行
      logger.info(`用户确认执行命令: ${result.command}`);
      const confirmedResult: CommandAnalysisResult = {
        ...result,
        shouldExecute: true,
        isAwaitingConfirmation: false,
        requireConfirmation: false
      };
      
      // 从等待确认列表中移除
      this.pendingRiskyCommands.delete(lastCommandKey);
      
      return confirmedResult;
    } else if (normalizedInput === 'n' || normalizedInput === 'no') {
      // 用户拒绝执行
      logger.info(`用户拒绝执行命令: ${result.command}`);
      const rejectedResult: CommandAnalysisResult = {
        ...result,
        shouldExecute: false,
        isAwaitingConfirmation: false,
        content: `命令已取消: ${result.command}`
      };
      
      // 从等待确认列表中移除
      this.pendingRiskyCommands.delete(lastCommandKey);
      
      return rejectedResult;
    }
    
    // 不是有效的确认响应
    return null;
  }

  /**
   * 从用户输入中提取确认响应
   * 支持直接在提示后面附加y/n回答，如 "是否执行此命令? (y/n) y"
   */
  private extractConfirmationResponse(input: string): string {
    // 检查输入是否已经就是简单的y/n/yes/no
    if (['y', 'yes', 'n', 'no'].includes(input)) {
      return input;
    }
    
    // 检查输入是否包含(y/n)后跟随的确认响应
    const confirmPattern = /\(y\/n\)\s*([yn]|yes|no)/i;
    const match = input.match(confirmPattern);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }

    // 检查输入的第一个字符是否是y或n（用于快速响应）
    if (input.toLowerCase().startsWith('y') || input.toLowerCase().startsWith('n')) {
      return input.toLowerCase().charAt(0);
    }
    
    // 查找输入的最后一个字符/词，它可能是响应
    const lastWord = input.split(/\s+/).pop() || '';
    if (['y', 'yes', 'n', 'no'].includes(lastWord.toLowerCase())) {
      return lastWord.toLowerCase();
    }
    
    return input;
  }

  /**
   * 使用AI分析命令或为常见命令绕过
   * @param command 用户的命令或问题
   * @param path 当前路径上下文
   * @param history 可选的上下文历史消息数组
   */
  async analyzeCommand(
    command: string, 
    path: string,
    history: AIMessage[] = []
  ): Promise<CommandAnalysisResult> {
    // 首先检查是否是对待确认命令的响应
    const confirmationResponse = this.checkConfirmationResponse(command);
    if (confirmationResponse) {
      return confirmationResponse;
    }
    
    // 检查命令本身是否包含确认响应（用于支持在提示后直接输入）
    const normalizedInput = this.extractConfirmationResponse(command.trim().toLowerCase());
    if (['y', 'yes', 'n', 'no'].includes(normalizedInput) && this.pendingRiskyCommands.size > 0) {
      // 构造一个新的确认响应并再次检查
      const lastCommand = Array.from(this.pendingRiskyCommands.keys()).pop();
      if (lastCommand) {
        const originalCommand = this.pendingRiskyCommands.get(lastCommand)?.command || '';
        return this.checkConfirmationResponse(normalizedInput) || {
          type: 'ai_response',
          content: `未找到待确认的命令。`,
          success: false,
          command: originalCommand,
          shouldExecute: false,
          requireConfirmation: false
        };
      }
    }
    
    logger.info(`分析命令: '${command}'，路径: ${path}`);
    
    // 检查此命令是否应该绕过AI
    if (this.shouldBypassAI(command)) {
      logger.info(`命令'${command}'绕过AI分析`);
      
      return {
        type: 'bash_execution',
        content: '',  // 绕过的命令不需要内容
        success: true,
        command: command,
        shouldExecute: true,
        bypassedAI: true,
        requireConfirmation: false
      };
    }
    
    // 命令需要AI分析
    try {
      // 准备AI消息，包括历史上下文
      const messages: AIMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...history,
        { 
          role: 'user',
          content: `命令: ${command}\n当前路径: ${path}\n请分析这个输入。`
        }
      ];

      // 准备AI补全选项
      const completionOptions: AICompletionOptions = {
        messages,
        temperature: 0.3, // 使用默认温度值
      };

      // 获取AI响应
      const response = await this.aiService.createCompletion(completionOptions);
      
      // 提取AI响应内容
      const responseContent = response.choices[0].message.content.trim();
      
      try {
        // 尝试解析JSON响应
        const cleanedResponse = responseContent.trim()
          // 移除可能的XML/HTML标签
          .replace(/<[^>]*>/g, '')
          // 移除Markdown反引号
          .replace(/```json|```/g, '')
          // 确保只保留可能的JSON部分
          .replace(/^(?:.|\n)*?(\{(?:.|\n)*\})(?:.|\n)*$/, '$1');
        
        let parsedResponse: CommandAnalysisResult;
        
        try {
          // 首先尝试直接解析
          parsedResponse = JSON.parse(cleanedResponse) as CommandAnalysisResult;
        } catch (firstParseError) {
          // 直接解析失败，尝试修复截断的JSON
          logger.warn(`初次JSON解析失败，尝试修复截断的JSON: ${firstParseError}`);
          
          // 尝试修复不完整的JSON
          let fixedJson = cleanedResponse;
          
          // 检查是否有未闭合的引号 - 常见的截断问题
          const quoteCount = (cleanedResponse.match(/"/g) || []).length;
          if (quoteCount % 2 !== 0) {
            // 引号数量不是偶数，可能有未闭合的字符串
            logger.warn(`检测到未闭合的引号，尝试修复`);
            
            // 查找最后一个完整的字段结束位置
            const lastValidPos = cleanedResponse.lastIndexOf('",');
            if (lastValidPos > 0) {
              fixedJson = cleanedResponse.substring(0, lastValidPos + 1) + '"}';
            } else {
              // 没有找到完整字段，尝试关闭整个JSON对象
              fixedJson = cleanedResponse + '"}';
            }
          }
          
          // 检查是否缺少结束括号
          if (!fixedJson.trim().endsWith('}')) {
            fixedJson = fixedJson + '}';
          }
          
          // 尝试再次解析修复后的JSON
          try {
            parsedResponse = JSON.parse(fixedJson) as CommandAnalysisResult;
            logger.info(`JSON修复成功`);
          } catch (secondParseError) {
            // 如果修复后仍然失败，尝试手动构建一个基本响应
            logger.error(`JSON修复失败: ${secondParseError}`);
            
            // 尝试提取type字段
            const typeMatch = cleanedResponse.match(/"type"\s*:\s*"([^"]+)"/);
            const type = typeMatch ? typeMatch[1] as 'bash_execution' | 'ai_response' : 'ai_response';
            
            // 尝试提取content字段的部分内容
            const contentMatch = cleanedResponse.match(/"content"\s*:\s*"([^"]+)/);
            const partialContent = contentMatch ? contentMatch[1] : '内容解析失败';
            
            // 构建基本响应
            parsedResponse = {
              type: type,
              content: `${partialContent}...(内容被截断)`,
              success: false,
              command: command,
              shouldExecute: false,
              requireConfirmation: false
            };
          }
        }
        
        // 验证响应结构
        if (!parsedResponse.type || !parsedResponse.content) {
          throw new Error('AI返回的响应结构无效');
        }

        // 如果需要确认，则添加确认消息并将命令放入待确认队列
        if (parsedResponse.requireConfirmation) {
          const riskLevel = parsedResponse.securityRisk || '未知';
          parsedResponse.confirmationMessage = `命令风险等级: ${riskLevel}\n${parsedResponse.content}\n是否仍然执行此命令? (y/n) `;
          parsedResponse.isAwaitingConfirmation = true;
          
          // 设置一个唯一的键，将命令存储在待确认队列中
          const commandKey = `${command}_${Date.now()}`;
          this.pendingRiskyCommands.set(commandKey, parsedResponse);
          
          // 修改返回结果，向用户显示确认信息
          parsedResponse.content = parsedResponse.confirmationMessage || '';
          parsedResponse.shouldExecute = false;
        }
        
        logger.info(`命令分析完成: 类型=${parsedResponse.type}, 是否执行=${parsedResponse.shouldExecute}, 需要确认=${parsedResponse.requireConfirmation}`);
        return parsedResponse;
      } catch (parseError) {
        logger.error(`解析AI响应为JSON失败: ${parseError}. 原始响应: ${responseContent.substring(0, 200)}...`);
        
        // 为常见命令提供默认响应
        const lowerCommand = command.toLowerCase().trim();
        if (lowerCommand.startsWith('ls') || 
            lowerCommand.startsWith('cd') || 
            lowerCommand.startsWith('pwd') ||
            lowerCommand.startsWith('echo') ||
            lowerCommand.startsWith('cat')) {
          return {
            type: 'bash_execution',
            content: '',
            success: true,
            command: command,
            shouldExecute: true,
            requireConfirmation: false
          };
        }
        
        // 回退响应
        return {
          type: 'ai_response',
          content: `AI无法解析命令。由于技术原因，您可能需要直接输入shell命令。\n\n原始命令: ${command}\n\n错误信息: ${parseError}`,
          success: false,
          command: command,
          shouldExecute: false,
          requireConfirmation: false
        };
      }
    } catch (error) {
      logger.error(`AI分析失败: ${error}`);
      
      // 完全失败的回退
      return {
        type: 'ai_response',
        content: `分析命令失败: ${(error as Error).message}`,
        success: false,
        command: command,
        shouldExecute: false,
        requireConfirmation: false
      };
    }
  }

  /**
   * 对可能有风险的命令进行安全分析
   */
  async analyzeSecurityRisks(command: string, path: string): Promise<CommandAnalysisResult> {
    logger.info(`对命令进行安全分析: '${command}'`);
    
    try {
      const messages: AIMessage[] = [
        { role: 'system', content: SECURITY_PROMPT },
        { 
          role: 'user',
          content: `命令: ${command}\n当前路径: ${path}\n对此命令进行安全分析。`
        }
      ];

      const completionOptions: AICompletionOptions = {
        messages,
        temperature: 0.2, // 对安全分析使用较低的温度值
        maxTokens: 2048,
      };

      const response = await this.aiService.createCompletion(completionOptions);
      const responseContent = response.choices[0].message.content.trim();
      
      try {
        // 尝试解析JSON响应
        const cleanedResponse = responseContent.trim()
          // 移除可能的XML/HTML标签
          .replace(/<[^>]*>/g, '')
          // 移除Markdown反引号
          .replace(/```json|```/g, '')
          // 确保只保留可能的JSON部分
          .replace(/^(?:.|\n)*?(\{(?:.|\n)*\})(?:.|\n)*$/, '$1');
        
        // 解析JSON
        const parsedResponse = JSON.parse(cleanedResponse) as CommandAnalysisResult;
        
        if (!parsedResponse.type || !parsedResponse.securityRisk) {
          throw new Error('AI返回的安全分析结构无效');
        }
        
        // 根据安全风险确定是否需要确认
        if (parsedResponse.securityRisk === 'medium' || 
            parsedResponse.securityRisk === 'high' || 
            parsedResponse.securityRisk === 'critical') {
          parsedResponse.requireConfirmation = true;
          const confirmationMsg = `检测到${parsedResponse.securityRisk}级别的安全风险:\n${parsedResponse.content}\n\n是否仍然执行此命令? (y/n) `;
          parsedResponse.confirmationMessage = confirmationMsg;
          parsedResponse.isAwaitingConfirmation = true;
          
          // 将命令添加到待确认队列
          const commandKey = `${command}_${Date.now()}`;
          this.pendingRiskyCommands.set(commandKey, parsedResponse);
          
          // 更新返回的内容，展示确认信息
          parsedResponse.content = confirmationMsg;
          parsedResponse.shouldExecute = false;
        }
        
        logger.info(`安全分析完成: 风险=${parsedResponse.securityRisk}, 是否执行=${parsedResponse.shouldExecute}, 需要确认=${parsedResponse.requireConfirmation}`);
        return parsedResponse;
      } catch (parseError) {
        logger.error(`解析安全分析结果失败: ${parseError}. 原始响应: ${responseContent.substring(0, 100)}...`);
        
        // 为安全分析提供保守的默认响应
        return {
          type: 'ai_response',
          content: `无法完成安全分析。出于安全考虑，请仔细检查此命令: ${command}\n\n是否仍然执行此命令? (y/n) `,
          success: false,
          command: command,
          shouldExecute: false,
          securityRisk: 'medium', // 默认为中等风险
          requireConfirmation: true,
          isAwaitingConfirmation: true
        };
      }
    } catch (error) {
      logger.error(`安全分析失败: ${error}`);
      return {
        type: 'ai_response',
        content: `无法执行安全分析: ${(error as Error).message}\n\n是否仍然执行此命令? (y/n) `,
        success: false,
        command: command,
        shouldExecute: false,
        securityRisk: 'medium', // 默认为中等风险
        requireConfirmation: true,
        isAwaitingConfirmation: true
      };
    }
  }
}

// 应用的单例实例
export const commandAnalysisService = new CommandAnalysisService(); 