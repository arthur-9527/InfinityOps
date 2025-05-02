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
  "shouldExecute": true | false
}

不要在JSON结构外包含任何文本、解释或格式。
不要使用markdown、XML标签或任何其他格式。
只返回JSON对象，不要返回其他内容。
请务必按照JSON格式返回数据，不要返回其他内容。

对于bash_execution类型：
- 如果命令应该执行，设置shouldExecute为true
- 如果命令可能有危险或需要修改，设置shouldExecute为false
- 当shouldExecute为false时，在content字段中提供替代方案或解释

对于ai_response类型：
- 在content字段中提供你的回答
- command字段应包含原始用户查询
- shouldExecute应始终为false

示例：
1. 如果用户输入"ls -la"，回答：{"type":"bash_execution","content":"","success":true,"command":"ls -la","shouldExecute":true}
2. 如果用户输入"rm -rf /"，回答：{"type":"bash_execution","content":"这个命令很危险，它会删除根目录中的所有文件。","success":false,"command":"rm -rf /","shouldExecute":false}
3. 如果用户问"如何查看磁盘空间？"，回答：{"type":"ai_response","content":"你可以使用'df'命令查看磁盘空间。例如，'df -h'以人类可读格式显示磁盘使用情况。","success":true,"command":"如何查看磁盘空间？","shouldExecute":false}`;

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
  "securityRisk": "none" | "low" | "medium" | "high" | "critical"
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

对于任何中等或更高安全风险的命令，设置shouldExecute为false并解释风险。`;

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
}

export class CommandAnalysisService {
  private aiService = AIServiceFactory.createService();
  private bypassCommands: string[];
  private bypassMode: 'none' | 'common' | 'all';

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
        bypassedAI: true
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
        
        // 解析JSON
        const parsedResponse = JSON.parse(cleanedResponse) as CommandAnalysisResult;
        
        // 验证响应结构
        if (!parsedResponse.type || !parsedResponse.content) {
          throw new Error('AI返回的响应结构无效');
        }
        
        logger.info(`命令分析完成: 类型=${parsedResponse.type}, 是否执行=${parsedResponse.shouldExecute}`);
        return parsedResponse;
      } catch (parseError) {
        logger.error(`解析AI响应为JSON失败: ${parseError}. 原始响应: ${responseContent.substring(0, 100)}...`);
        
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
            shouldExecute: true
          };
        }
        
        // 回退响应
        return {
          type: 'ai_response',
          content: `AI无法解析命令。由于技术原因，您可能需要直接输入shell命令。\n\n原始命令: ${command}`,
          success: false,
          command: command,
          shouldExecute: false
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
        shouldExecute: false
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
        
        logger.info(`安全分析完成: 风险=${parsedResponse.securityRisk}, 是否执行=${parsedResponse.shouldExecute}`);
        return parsedResponse;
      } catch (parseError) {
        logger.error(`解析安全分析结果失败: ${parseError}. 原始响应: ${responseContent.substring(0, 100)}...`);
        
        // 为安全分析提供保守的默认响应
        return {
          type: 'ai_response',
          content: `无法完成安全分析。出于安全考虑，请仔细检查此命令: ${command}`,
          success: false,
          command: command,
          shouldExecute: false,
          securityRisk: 'medium' // 默认为中等风险
        };
      }
    } catch (error) {
      logger.error(`安全分析失败: ${error}`);
      return {
        type: 'ai_response',
        content: `无法执行安全分析: ${(error as Error).message}`,
        success: false,
        command: command,
        shouldExecute: false,
        securityRisk: 'medium' // 默认为中等风险
      };
    }
  }
}

// 应用的单例实例
export const commandAnalysisService = new CommandAnalysisService(); 