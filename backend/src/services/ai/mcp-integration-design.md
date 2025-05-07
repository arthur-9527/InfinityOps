# MCP 集成设计

## 概述

MCP（Model Control Protocol）是InfinityOps的插件系统，允许AI调用本地工具和服务来扩展其能力。命令分析服务将与MCP系统集成，使AI能够识别需要由MCP处理的命令，并将这些命令转发给相应的MCP处理器。

## MCP命令类型

MCP命令是指需要由本地工具或服务处理，而不是直接发送到SSH服务器的命令。这些命令可以分为以下几类：

1. **文件操作命令**：如本地文件浏览、编辑等
2. **系统信息查询命令**：获取本地系统状态、性能数据等
3. **工具调用命令**：调用特定工具执行任务
4. **自定义命令**：用户自定义的特殊命令

## MCP识别流程

命令分析服务需要识别潜在的MCP命令。实现方式有：

1. **前缀识别**：使用特定前缀标记MCP命令，如`$mcp run`
2. **AI识别**：使用AI分析命令意图，识别需要MCP处理的命令
3. **混合方法**：结合前两种方法，提高准确性

## 集成设计

### MCP命令分析

在`CommandAnalysisService`中，我们需要添加以下方法：

```typescript
/**
 * 检查命令是否为MCP命令
 * @param command 要检查的命令
 * @returns 如果是MCP命令则返回true，否则返回false
 */
private isMCPCommand(command: string): boolean {
  // 前缀检查 - 检查命令是否以特定前缀开始
  if (command.startsWith('$mcp') || command.startsWith('#mcp') || command.startsWith('@mcp')) {
    return true;
  }
  
  // 模式匹配 - 检查是否匹配常见MCP命令模式
  const mcpCommandPatterns = [
    /^local\s+(ls|cd|cp|mv|rm|mkdir|touch)/i,
    /^tools?\s+/i,
    /^info\s+/i,
    /^script\s+/i
  ];
  
  for (const pattern of mcpCommandPatterns) {
    if (pattern.test(command)) {
      return true;
    }
  }
  
  return false;
}
```

### MCP服务接口

定义MCP服务接口：

```typescript
interface IMCPService {
  /**
   * 执行MCP命令
   * @param command 要执行的命令
   * @param sessionId 会话ID
   * @returns 执行结果
   */
  executeCommand(command: string, sessionId: string): Promise<{
    success: boolean;
    output: string;
    error?: string;
  }>;
  
  /**
   * 检查MCP服务是否可用
   * @returns 如果MCP服务可用则返回true，否则返回false
   */
  isAvailable(): boolean;
}
```

### MCP命令分析结果

对于被识别为MCP命令的指令，命令分析结果将设置如下：

```typescript
{
  commandType: CommandType.MCP,
  shouldExecute: true,
  shouldChangeTerminalState: false, // MCP命令通常不改变终端状态
  newTerminalState: 'normal',
  modifiedCommand: command, // 保持原始命令不变或去除MCP前缀
  explanation: `通过MCP执行命令: ${command}`,
  feedback: {
    needsFeedback: false,
    message: ''
  },
  analysis: {
    commandPurpose: '执行本地MCP操作',
    potentialIssues: [],
    alternatives: []
  }
}
```

## MCP命令处理流程

在WebSocket服务中，MCP命令的处理流程如下：

```typescript
// 在接收到用户命令时调用
const analysisResult = await commandAnalysisService.analyzeCommand({
  command: userCommand,
  currentTerminalState: clientSshSessions.get(clientId).terminalState,
  sessionId: sessionInfo.sessionId
});

// 处理MCP命令
if (analysisResult.commandType === CommandType.MCP) {
  try {
    // 执行MCP命令
    const mcpResult = await mcpService.executeCommand(
      analysisResult.modifiedCommand,
      sessionInfo.sessionId
    );
    
    // 返回MCP执行结果给客户端
    client.send(JSON.stringify({
      type: 'terminalResponse',
      payload: {
        output: mcpResult.output,
        success: mcpResult.success
      }
    }));
    
    // 不向SSH服务器发送命令
    return;
  } catch (error) {
    // MCP执行错误处理
    client.send(JSON.stringify({
      type: 'terminalResponse',
      payload: {
        output: `MCP执行错误: ${error.message}`,
        success: false
      }
    }));
    return;
  }
}

// 处理其他类型的命令...
```

## AI提示词修改

为了支持MCP命令识别，我们需要修改命令分析提示词，添加MCP相关的说明：

```markdown
## MCP命令识别

MCP命令是指需要由本地工具处理而不是发送到SSH服务器的命令。可通过以下方式识别:

1. 命令前缀: 以`$mcp`, `#mcp`或`@mcp`开头的命令
2. 命令模式: 匹配以下模式的命令:
   - `local [ls|cd|cp|mv|rm|mkdir|touch]...` - 本地文件操作
   - `tool ...` 或 `tools ...` - 工具调用
   - `info ...` - 系统信息查询
   - `script ...` - 脚本管理

对于MCP命令:
- commandType应设置为"mcp"
- shouldExecute应设置为true
- shouldChangeTerminalState通常为false
```

## 未来扩展

1. **MCP命令注册系统**：允许插件注册新的MCP命令
2. **MCP命令权限管理**：控制不同用户对MCP命令的访问权限
3. **MCP命令别名**：提供常用MCP命令的简短别名
4. **MCP命令帮助系统**：为用户提供MCP命令的帮助信息 