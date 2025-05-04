import { AIServiceFactory } from '../../ai/ai.factory';
import { AICompletionOptions, AIMessage } from '../../ai/ai.interface';
import { MCPRequestContext, MCPResponse } from '../interfaces/mcp.interface';
import { BaseMCPService } from './base-mcp.service';
import dotenv from 'dotenv';

dotenv.config();

// Constants and types
export type CommandType = 'bash_execution' | 'ai_response' | 'script_execution';

export interface CommandAnalysisResult {
  type: CommandType;
  content: string;
  success: boolean;
  command?: string;
  commands?: string[]; 
  script?: string;     
  scriptType?: 'bash' | 'python' | 'node' | 'ruby';
  shouldExecute?: boolean;
  securityRisk?: 'none' | 'low' | 'medium' | 'high' | 'critical';
  bypassedAI?: boolean;
  requireConfirmation?: boolean;
  confirmationMessage?: string;
  isAwaitingConfirmation?: boolean;
}

/**
 * CommandMCPService - Built-in MCP service for command analysis
 * 
 * This service analyzes user commands to determine if they should
 * be executed directly, need explanations, or should be handled
 * by the AI assistant.
 */
export class CommandMCPService extends BaseMCPService {
  // MCP Service interface properties
  readonly id = 'command-analysis';
  readonly name = '命令分析服务';
  readonly description = '分析用户输入的命令，提供执行建议和安全分析';
  readonly priority = 10; // High priority (low number)
  readonly isSystemService = true;
  
  // Service-specific properties
  private aiService = AIServiceFactory.createService();
  private bypassCommands: string[];
  private bypassMode: 'none' | 'common' | 'all';
  private pendingRiskyCommands: Map<string, CommandAnalysisResult> = new Map();
  
  // System prompts
  private readonly SYSTEM_PROMPT = `你是集成在名为InfinityOps的终端环境中的AI助手。
你的主要功能是：
1. 分析用户命令，判断它们是标准的bash命令还是对AI的请求。
2. 对于bash命令：确定它们是应该直接执行还是需要解释或修改。
3. 对于AI请求：基于你的知识提供有用且准确的回答。
4. 对于复杂请求：生成适当的shell脚本或命令序列来执行多步骤操作。

!!!!重要!!!!
你必须按照以下结构JSON格式返回数据：
{
  "type": "bash_execution" | "ai_response" | "script_execution",
  "content": "你的详细响应或命令解释",
  "success": true | false,
  "command": "要执行的命令（如适用）",
  "commands": ["命令1", "命令2", ...], // 当需要执行多个命令时使用
  "script": "#!/bin/bash\\n\\n# 完整的shell脚本内容\\n...", // 用于复杂操作的shell脚本
  "scriptType": "bash" | "python" | "node" | "ruby", // 脚本类型
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

对于script_execution类型：
- 用于复杂的多步骤操作
- 在script字段中提供完整的shell脚本
- 在scriptType字段中指定脚本类型(bash/python/node/ruby)
- 在content字段中提供对脚本功能的简短说明
- requireConfirmation应设置为true
- 确保脚本内包含清晰的注释和错误处理`;

  private readonly SECURITY_PROMPT = `你是集成在InfinityOps终端环境中专注于安全的AI助手。
你的主要关注点是安全，优先事项如下：
1. 识别可能损害系统的潜在有害命令
2. 为有风险的命令建议更安全的替代方案
3. 教育用户关于安全最佳实践
4. 评估脚本和命令序列的安全性

重要提示：你必须只返回符合以下结构的有效JSON：
{
  "type": "bash_execution" | "ai_response" | "script_execution",
  "content": "你的详细响应或命令解释",
  "success": true | false,
  "command": "要执行的命令（这里必须是基于unix bash的命令操作,不可以为其他。！！！特别重要！！！）",
  "commands": ["命令1", "命令2", ...], 
  "script": "完整的shell脚本内容", 
  "scriptType": "bash" | "python" | "node" | "ruby",
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
- 包含潜在危险操作的脚本
- 执行未经验证的下载代码的脚本

对于任何中等或更高安全风险的命令或脚本，设置shouldExecute为false并解释风险。
对于低或中等风险的命令或脚本，设置requireConfirmation为true，这将提示用户确认是否执行。
对于高或严重风险的命令或脚本，设置requireConfirmation为true，即使shouldExecute为false。`;

  // 不需要AI分析的常见命令列表
  private readonly DEFAULT_BYPASS_COMMANDS = [
    'ls', 'cd', 'pwd', 'clear', 'history', 'echo', 'cat', 'mkdir', 
    'touch', 'cp', 'mv', 'date', 'whoami', 'df', 'du', 'free',
    'ps', 'top', 'uname', 'hostname', 'ifconfig', 'ip'
  ];

  // 应该始终通过AI分析的命令前缀
  private readonly ALWAYS_ANALYZE_PREFIXES = [
    'sudo', 'rm', '>', '>>', '|', ';', '&&', '||'
  ];

  constructor() {
    super();
    // Initialize service properties
    this.bypassCommands = this.getBypassCommands();
    this.bypassMode = this.getBypassMode();
  }

  async initialize(): Promise<void> {
    await super.initialize();
    this.logger.info(`Command MCP service initialized, bypass mode: ${this.bypassMode}`);
    if (this.bypassMode === 'common') {
      this.logger.info(`Bypass commands: ${this.bypassCommands.join(', ')}`);
    }
  }

  /**
   * Check if this service can handle the given request.
   * The CommandMCP service can handle all command inputs, but with different
   * confidence levels depending on the input.
   */
  async canHandle(context: MCPRequestContext): Promise<number> {
    const input = context.input.trim();
    
    // Check if this is a confirmation response for a pending command
    if (this.isConfirmationResponse(input) !== null && this.pendingRiskyCommands.size > 0) {
      return 0.9; // Very high confidence for confirmation responses
    }
    
    // Check if this looks like a weather query
    if (this.isWeatherQuery(input)) {
      return 0.1; // Low confidence for weather queries (let the weather MCP handle it)
    }
    
    // Special handling for empty inputs
    if (!input) {
      return 0.1; // Low confidence, but can still handle
    }
    
    // If it looks like a command (starts with common command prefixes)
    if (this.looksLikeCommand(input)) {
      return 0.8; // High confidence for commands
    }
    
    // Medium confidence as fallback for other inputs
    // This allows other specialized MCPs to handle specific domains
    // But ensures this service can handle anything not claimed by others
    return 0.5;
  }

  /**
   * Check if the input looks like a weather query
   */
  private isWeatherQuery(input: string): boolean {
    const weatherKeywords = [
      '天气', '气温', '温度', '下雨', '阴天', '晴天', '多云',
      'weather', 'temperature', 'rain', 'sunny', 'cloudy', 'forecast'
    ];
    
    const normalizedInput = input.toLowerCase();
    return weatherKeywords.some(keyword => normalizedInput.includes(keyword));
  }

  /**
   * Check if the input looks like a command
   */
  private looksLikeCommand(input: string): boolean {
    // Common command prefixes and patterns
    const commandPatterns = [
      /^(ls|cd|mkdir|rm|cp|mv|cat|grep|find|touch|chmod|chown|ps|kill|sudo)/i,
      /^git\s/i,
      /^npm\s/i,
      /^docker\s/i,
      /^python\s/i,
      /^node\s/i,
      /^ssh\s/i,
      /^curl\s/i,
      /^wget\s/i
    ];
    
    return commandPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Process the request
   */
  async process(context: MCPRequestContext): Promise<MCPResponse> {
    const input = context.input.trim();
    const path = context.path || '~';
    
    // First check if this is a confirmation response
    const confirmationResponse = this.checkConfirmationResponse(input);
    if (confirmationResponse) {
      return this.convertToMCPResponse(confirmationResponse);
    }
    
    // Analyze the command
    const result = await this.analyzeCommand(input, path);
    return this.convertToMCPResponse(result);
  }

  /**
   * Handle confirmation responses
   */
  async handleConfirmation(context: MCPRequestContext, isConfirmed: boolean): Promise<MCPResponse> {
    const commandKey = Array.from(this.pendingRiskyCommands.keys()).pop();
    if (!commandKey) {
      return this.createResponse('error', '没有待确认的命令。', false);
    }
    
    const result = this.pendingRiskyCommands.get(commandKey);
    if (!result) {
      return this.createResponse('error', '无法找到待确认的命令详情。', false);
    }
    
    // Remove from pending commands
    this.pendingRiskyCommands.delete(commandKey);
    
    if (isConfirmed) {
      // User confirmed execution
      this.logger.info(`User confirmed execution of command: ${result.command}`);
      const confirmedResult: CommandAnalysisResult = {
        ...result,
        shouldExecute: true,
        isAwaitingConfirmation: false,
        requireConfirmation: false
      };
      
      return this.convertToMCPResponse(confirmedResult);
    } else {
      // User rejected execution
      this.logger.info(`User rejected execution of command: ${result.command}`);
      return this.createResponse(
        'info',
        `命令已取消: ${result.command}`,
        true
      );
    }
  }

  // Private utility methods (Part 1)
  
  /**
   * Convert CommandAnalysisResult to MCPResponse
   */
  private convertToMCPResponse(result: CommandAnalysisResult): MCPResponse {
    // Create metadata with command-specific fields
    const metadata: Record<string, any> = {};
    
    if (result.command) metadata.command = result.command;
    if (result.commands) metadata.commands = result.commands;
    if (result.script) metadata.script = result.script;
    if (result.scriptType) metadata.scriptType = result.scriptType;
    if (result.securityRisk) metadata.securityRisk = result.securityRisk;
    if (result.bypassedAI) metadata.bypassedAI = result.bypassedAI;
    
    // Handle confirmation requests
    if (result.requireConfirmation && result.isAwaitingConfirmation) {
      return {
        type: result.type,
        content: result.confirmationMessage || result.content,
        success: result.success,
        metadata,
        requireConfirmation: true,
        isAwaitingConfirmation: true,
        confirmationMessage: result.confirmationMessage
      };
    }
    
    // Standard response
    return {
      type: result.type,
      content: result.content,
      success: result.success,
      metadata,
      shouldProcess: result.shouldExecute
    };
  }

  /**
   * From environment variable, get bypass commands
   */
  private getBypassCommands(): string[] {
    const envBypassCommands = process.env.BYPASS_COMMANDS;
    if (envBypassCommands) {
      return envBypassCommands.split(',').map(cmd => cmd.trim());
    }
    return this.DEFAULT_BYPASS_COMMANDS;
  }

  /**
   * From environment variable, get bypass mode
   */
  private getBypassMode(): 'none' | 'common' | 'all' {
    const mode = process.env.COMMAND_BYPASS_MODE || 'common';
    if (mode === 'none' || mode === 'all') {
      return mode as 'none' | 'all';
    }
    return 'common';
  }

  /**
   * Determine if the input is a confirmation response (yes/no)
   */
  private isConfirmationResponse(input: string): boolean | null {
    const normalized = input.toLowerCase();
    
    // Direct yes/no responses
    if (['y', 'yes', '是', '确认', '同意'].includes(normalized)) {
      return true;
    }
    
    if (['n', 'no', '否', '不', '取消', '拒绝'].includes(normalized)) {
      return false;
    }
    
    // Check for confirmation patterns like "(y/n) y"
    const confirmPattern = /\(y\/n\)\s*([yn]|yes|no)/i;
    const match = normalized.match(confirmPattern);
    if (match && match[1]) {
      const response = match[1].toLowerCase();
      return response === 'y' || response === 'yes';
    }
    
    // Check if input starts with y/n (quick response)
    if (normalized.startsWith('y') || normalized.startsWith('是') || normalized.startsWith('确认')) {
      return true;
    }
    
    if (normalized.startsWith('n') || normalized.startsWith('不') || normalized.startsWith('否')) {
      return false;
    }
    
    // Not a confirmation response
    return null;
  }

  /**
   * Check if this is a confirmation response for a pending risky command
   */
  private checkConfirmationResponse(input: string): CommandAnalysisResult | null {
    const normalized = input.trim().toLowerCase();
    
    // If no pending commands, not a confirmation response
    if (this.pendingRiskyCommands.size === 0) {
      return null;
    }
    
    // Get the most recent pending command
    const lastCommandKey = Array.from(this.pendingRiskyCommands.keys()).pop();
    if (!lastCommandKey) {
      return null;
    }
    
    const result = this.pendingRiskyCommands.get(lastCommandKey);
    if (!result) {
      return null;
    }
    
    // Check if the input is a yes/no response
    const confirmResponse = this.extractConfirmationResponse(normalized);
    
    if (confirmResponse === 'y' || confirmResponse === 'yes') {
      // User confirmed execution
      this.logger.info(`User confirmed execution of command: ${result.command}`);
      const confirmedResult: CommandAnalysisResult = {
        ...result,
        shouldExecute: true,
        isAwaitingConfirmation: false,
        requireConfirmation: false
      };
      
      // Remove from pending list
      this.pendingRiskyCommands.delete(lastCommandKey);
      
      return confirmedResult;
    } else if (confirmResponse === 'n' || confirmResponse === 'no') {
      // User rejected execution
      this.logger.info(`User rejected execution of command: ${result.command}`);
      const rejectedResult: CommandAnalysisResult = {
        ...result,
        shouldExecute: false,
        isAwaitingConfirmation: false,
        content: `命令已取消: ${result.command}`
      };
      
      // Remove from pending list
      this.pendingRiskyCommands.delete(lastCommandKey);
      
      return rejectedResult;
    }
    
    // Not a confirmation response
    return null;
  }

  /**
   * Extract confirmation response from user input
   */
  private extractConfirmationResponse(input: string): string {
    // Check if input is already a simple y/n/yes/no
    if (['y', 'yes', 'n', 'no'].includes(input)) {
      return input;
    }
    
    // Check if input contains (y/n) followed by confirmation
    const confirmPattern = /\(y\/n\)\s*([yn]|yes|no)/i;
    const match = input.match(confirmPattern);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
    
    // Check if input starts with y or n (quick response)
    if (input.toLowerCase().startsWith('y') || input.toLowerCase().startsWith('n')) {
      return input.toLowerCase().charAt(0);
    }
    
    // Check if the last word is a response
    const lastWord = input.split(/\s+/).pop() || '';
    if (['y', 'yes', 'n', 'no'].includes(lastWord.toLowerCase())) {
      return lastWord.toLowerCase();
    }
    
    return input;
  }

  /**
   * Analyze command using AI or bypass for common commands
   */
  private async analyzeCommand(
    command: string, 
    path: string,
    history: AIMessage[] = []
  ): Promise<CommandAnalysisResult> {
    this.logger.info(`Analyzing command: '${command}', path: ${path}`);
    
    // Check if this command should bypass AI
    if (this.shouldBypassAI(command)) {
      this.logger.info(`Command '${command}' bypassed AI analysis`);
      
      return {
        type: 'bash_execution',
        content: '',
        success: true,
        command: command,
        shouldExecute: true,
        bypassedAI: true,
        requireConfirmation: false
      };
    }
    
    // Command needs AI analysis
    try {
      // Prepare AI messages including history
      const messages: AIMessage[] = [
        { role: 'system', content: this.SYSTEM_PROMPT },
        ...history,
        { 
          role: 'user',
          content: `命令: ${command}\n当前路径: ${path}\n请分析这个输入。`
        }
      ];

      // Prepare AI completion options
      const completionOptions: AICompletionOptions = {
        messages,
        temperature: 0.3,
        maxTokens: 4096,
      };

      // Get AI response
      const response = await this.aiService.createCompletion(completionOptions);
      const responseContent = response.choices[0].message.content.trim();
      
      this.logger.debug('Raw AI response: ' + responseContent.substring(0, 100) + '...');
      
      try {
        // Try to parse JSON response
        const cleanedResponse = this.cleanAIResponse(responseContent);
        let parsedResponse: CommandAnalysisResult;
        
        try {
          // First try to parse directly
          parsedResponse = JSON.parse(cleanedResponse) as CommandAnalysisResult;
        } catch (firstParseError) {
          // Direct parsing failed, try to fix truncated JSON
          this.logger.warn(`Initial JSON parsing failed, trying to fix truncated JSON: ${firstParseError}`);
          
          const fixedJson = this.fixTruncatedJson(cleanedResponse);
          
          // Try to parse fixed JSON
          try {
            parsedResponse = JSON.parse(fixedJson) as CommandAnalysisResult;
            this.logger.info(`JSON fix successful`);
          } catch (secondParseError) {
            // If fix still failed, build a fallback response
            this.logger.error(`JSON fix failed: ${secondParseError}`);
            parsedResponse = this.createFallbackAnalysisResult(command, cleanedResponse);
          }
        }
        
        // Validate response structure
        if (!parsedResponse.type) {
          throw new Error('AI returned an invalid response structure');
        }

        // Handle confirmation requests
        if (parsedResponse.requireConfirmation) {
          parsedResponse = this.prepareConfirmationMessage(parsedResponse);
          
          // Store in pending commands
          const commandKey = `${command}_${Date.now()}`;
          this.pendingRiskyCommands.set(commandKey, parsedResponse);
        }
        
        this.logger.info(`Command analysis complete: type=${parsedResponse.type}, execute=${parsedResponse.shouldExecute}, confirm=${parsedResponse.requireConfirmation}`);
        return parsedResponse;
      } catch (parseError) {
        this.logger.error(`Failed to parse AI response as JSON: ${parseError}`);
        return this.createErrorAnalysisResult(command, parseError as Error);
      }
    } catch (error) {
      this.logger.error(`AI analysis failed: ${error}`);
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
   * Clean AI response by removing markdown formatting, etc.
   */
  private cleanAIResponse(response: string): string {
    return response.trim()
      // Remove possible XML/HTML tags
      .replace(/<[^>]*>/g, '')
      // Remove markdown backticks
      .replace(/```json|```/g, '')
      // Ensure only the possible JSON part is kept
      .replace(/^(?:.|\n)*?(\{(?:.|\n)*\})(?:.|\n)*$/, '$1');
  }

  /**
   * Try to fix truncated JSON
   */
  private fixTruncatedJson(json: string): string {
    let fixedJson = json;
    
    // Check for unclosed quotes - common truncation issue
    const quoteCount = (json.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      this.logger.warn(`Detected unclosed quotes, attempting to fix`);
      
      // Find the last complete field end position
      const lastValidPos = json.lastIndexOf('",');
      if (lastValidPos > 0) {
        fixedJson = json.substring(0, lastValidPos + 1) + '"}';
      } else {
        // No complete field found, try to close the entire JSON object
        fixedJson = json + '"}';
      }
    }
    
    // Check if missing closing brace
    if (!fixedJson.trim().endsWith('}')) {
      fixedJson = fixedJson + '}';
    }
    
    return fixedJson;
  }

  /**
   * Create a fallback analysis result for common commands
   */
  private createFallbackAnalysisResult(command: string, responseContent: string): CommandAnalysisResult {
    const lowerCommand = command.toLowerCase().trim();
    
    // For common commands, provide a default response
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
    
    // Try to extract type field
    const typeMatch = responseContent.match(/"type"\s*:\s*"([^"]+)"/);
    const type = typeMatch ? typeMatch[1] as CommandType : 'ai_response';
    
    // Try to extract content field
    const contentMatch = responseContent.match(/"content"\s*:\s*"([^"]+)/);
    const partialContent = contentMatch ? contentMatch[1] : 'Content parsing failed';
    
    // Fallback response
    return {
      type: type,
      content: `${partialContent}...(content truncated)`,
      success: false,
      command: command,
      shouldExecute: false,
      requireConfirmation: false
    };
  }

  /**
   * Create an error analysis result
   */
  private createErrorAnalysisResult(command: string, error: Error): CommandAnalysisResult {
    return {
      type: 'ai_response',
      content: `AI 无法解析命令。由于技术原因，您可能需要直接输入 shell 命令。\n\n原始命令: ${command}\n\n错误信息: ${error}`,
      success: false,
      command: command,
      shouldExecute: false,
      requireConfirmation: false
    };
  }

  /**
   * Prepare confirmation message based on analysis result
   */
  private prepareConfirmationMessage(result: CommandAnalysisResult): CommandAnalysisResult {
    const riskLevel = result.securityRisk || '未知';
    
    if (result.type === 'script_execution') {
      // For script execution, show script type and preview
      const scriptType = result.scriptType || 'bash';
      const scriptPreview = result.script ? 
        result.script.split('\n').slice(0, 5).join('\n') + 
        (result.script.split('\n').length > 5 ? '\n...(more lines)' : '') : 
        'No script content';
      
      result.confirmationMessage = `操作类型: 脚本执行 (${scriptType})\n` +
        `风险等级: ${riskLevel}\n` +
        `${result.content}\n\n` +
        `脚本预览:\n${scriptPreview}\n\n` +
        `是否执行此脚本? (y/n) `;
      
      this.logger.info(`Ready to execute ${scriptType} script, lines: ${result.script?.split('\n').length || 0}`);
    } else if (result.commands && result.commands.length > 0) {
      // For command array, show list of commands
      const commandsList = result.commands.map((cmd, i) => `${i+1}. ${cmd}`).join('\n');
      
      result.confirmationMessage = `操作类型: 多命令执行\n` +
        `风险等级: ${riskLevel}\n` +
        `${result.content}\n\n` +
        `将执行以下命令:\n${commandsList}\n\n` +
        `是否继续? (y/n) `;
      
      this.logger.info(`Ready to execute command sequence, count: ${result.commands.length}`);
    } else {
      // For single command execution, use original message format
      result.confirmationMessage = `命令风险等级: ${riskLevel}\n${result.content}\n是否仍然执行此命令? (y/n) `;
    }
    
    result.isAwaitingConfirmation = true;
    return result;
  }

  /**
   * Check if a command should bypass AI analysis
   */
  private shouldBypassAI(command: string): boolean {
    // If bypass mode is none, always use AI
    if (this.bypassMode === 'none') {
      return false;
    }
    
    // If bypass mode is all, skip AI analysis for all commands
    if (this.bypassMode === 'all') {
      return true;
    }
    
    // For common mode, check if it's a simple command that can skip AI
    const trimmedCommand = command.trim();
    const baseCommand = trimmedCommand.split(' ')[0];
    
    // If command contains any prefixes that should always be analyzed, don't bypass
    for (const prefix of this.ALWAYS_ANALYZE_PREFIXES) {
      if (trimmedCommand.includes(prefix)) {
        return false;
      }
    }
    
    // Check if base command is in bypass list
    return this.bypassCommands.includes(baseCommand);
  }
}

// Export a singleton instance
export const commandMCPService = new CommandMCPService(); 