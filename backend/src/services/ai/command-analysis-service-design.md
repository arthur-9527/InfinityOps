# 命令分析服务设计

## 服务概述

CommandAnalysisService 是一个负责分析用户输入命令并提供处理策略的服务。它利用AI能力分析命令类型，并根据配置和命令特性决定如何处理命令。

## 服务类结构

```typescript
export class CommandAnalysisService implements ICommandAnalysisService {
  private aiService: AIService;
  private bypassCommands: string[];
  private bypassMode: 'none' | 'common' | 'all';
  private commandPrompt: string;

  constructor() {
    // 初始化服务，加载配置和创建AI服务实例
    // 从.env加载COMMAND_BYPASS_MODE和BYPASS_COMMANDS
    // 从文件加载命令分析提示词
  }

  // 实现ICommandAnalysisService接口方法
  public async analyzeCommand(params: CommandAnalysisParams): Promise<CommandAnalysisResult>;
  public isCommandInBypassList(command: string): boolean;

  // 私有辅助方法
  private getCommandBase(command: string): string;
  private shouldBypassAnalysis(command: string): boolean;
  private async analyzeWithAI(params: CommandAnalysisParams): Promise<CommandAnalysisResult>;
  private parseAIResponse(responseText: string): CommandAnalysisResult;
  private handleParseError(error: any, command: string): CommandAnalysisResult;
}
```

## 主要方法

### 构造函数

```typescript
constructor() {
  // 从环境变量加载配置
  this.bypassMode = process.env.COMMAND_BYPASS_MODE as 'none' | 'common' | 'all' || 'common';
  
  // 加载要跳过分析的命令列表
  const bypassCommandsStr = process.env.BYPASS_COMMANDS || 'ls,cd,pwd,clear,history,echo,cat,mkdir,touch,cp,mv,date,whoami,df,du,free,ps,top,uname,hostname,ifconfig,ip';
  this.bypassCommands = bypassCommandsStr.split(',').map(cmd => cmd.trim());
  
  // 创建AI服务实例
  this.aiService = AIFactory.createDefaultService();
  
  // 加载提示词
  this.commandPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'command-analysis-prompt.md'), 'utf-8');
}
```

### analyzeCommand

```typescript
/**
 * 分析命令并返回处理策略
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
    return await this.analyzeWithAI(params);
  } catch (error) {
    return this.handleParseError(error, command);
  }
}
```

### isCommandInBypassList

```typescript
/**
 * 判断命令是否在跳过列表中
 */
public isCommandInBypassList(command: string): boolean {
  const baseCommand = this.getCommandBase(command);
  return this.bypassCommands.includes(baseCommand);
}
```

### shouldBypassAnalysis

```typescript
/**
 * 根据配置判断是否应该跳过AI分析
 */
private shouldBypassAnalysis(command: string): boolean {
  // 如果配置为all，跳过所有命令的AI分析
  if (this.bypassMode === 'all') {
    return true;
  }
  
  // 如果配置为none，不跳过任何命令的AI分析
  if (this.bypassMode === 'none') {
    return false;
  }
  
  // 如果配置为common，检查命令是否在跳过列表中
  return this.isCommandInBypassList(command);
}
```

### getCommandBase

```typescript
/**
 * 获取命令的基本部分（不包括参数）
 */
private getCommandBase(command: string): string {
  // 去除命令中的参数，只返回命令本身
  const trimmedCommand = command.trim();
  const parts = trimmedCommand.split(' ');
  return parts[0];
}
```

### analyzeWithAI

```typescript
/**
 * 使用AI服务分析命令
 */
private async analyzeWithAI(params: CommandAnalysisParams): Promise<CommandAnalysisResult> {
  const { command, currentTerminalState, osInfo } = params;
  
  // 构建提示词
  const prompt = `
命令: ${command}
当前终端状态: ${currentTerminalState}
操作系统: ${osInfo?.platform || 'linux'}
${osInfo?.distribution ? `发行版: ${osInfo.distribution}` : ''}
${osInfo?.version ? `版本: ${osInfo.version}` : ''}

请分析上述命令并返回JSON格式的处理策略。
  `;
  
  // 调用AI服务
  const response = await this.aiService.callAI({
    prompt,
    systemPrompt: this.commandPrompt,
    temperature: 0.3, // 使用较低的temperature以获得更确定性的结果
  });
  
  // 解析AI响应
  return this.parseAIResponse(response.text);
}
```

### parseAIResponse

```typescript
/**
 * 解析AI响应为CommandAnalysisResult对象
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
    
    return result;
  } catch (error) {
    throw new Error(`解析AI响应失败: ${error.message}`);
  }
}
```

### handleParseError

```typescript
/**
 * 处理解析错误，返回默认的错误结果
 */
private handleParseError(error: any, command: string): CommandAnalysisResult {
  console.error(`命令分析失败: ${error.message}`);
  
  // 返回默认的错误结果
  const result = { ...DEFAULT_INVALID_COMMAND_RESULT };
  result.modifiedCommand = command;
  result.feedback.message = `解析命令失败: ${command}。请检查命令是否正确或稍后重试。`;
  
  return result;
}
```

## 集成建议

1. **在WebSocket服务中集成**:
   ```typescript
   // 在接收到用户命令时调用
   const analysisResult = await commandAnalysisService.analyzeCommand({
     command: userCommand,
     currentTerminalState: clientSshSessions.get(clientId).terminalState,
     sessionId: sessionInfo.sessionId
   });
   
   // 根据分析结果处理命令
   if (analysisResult.shouldChangeTerminalState) {
     changeTerminalState(clientId, analysisResult.newTerminalState);
   }
   
   if (analysisResult.shouldExecute) {
     // 执行命令...
     session.shell.write(analysisResult.modifiedCommand + '\n');
   } else if (analysisResult.feedback.needsFeedback) {
     // 向用户提供反馈...
     client.send(JSON.stringify({
       type: 'terminalResponse',
       payload: { output: analysisResult.feedback.message }
     }));
   }
   ```

2. **性能优化**:
   - 考虑缓存常见命令的分析结果
   - 实现分析超时机制，避免长时间等待
   - 对于简单命令使用规则匹配，减少AI调用 