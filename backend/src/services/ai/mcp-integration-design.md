# MCP 集成设计

## 概述

MCP（Model Control Protocol）是InfinityOps的插件系统，允许AI调用本地工具和服务来扩展其能力。命令分析服务将与MCP系统集成，使AI能够识别需要由MCP处理的命令，并将这些命令转发给相应的MCP处理器。

## MCP命令类型

MCP命令是指需要由本地工具或服务处理，而不是直接发送到SSH服务器的命令。这些命令可以分为以下几类：

1. **文件操作命令**：如本地文件浏览、编辑等
2. **系统信息查询命令**：获取本地系统状态、性能数据等
3. **工具调用命令**：调用特定工具执行任务
4. **自定义命令**：用户自定义的特殊命令

## MCP服务类型

在InfinityOps中，我们预定义了以下几种MCP服务类型：

1. **fileManager**：文件管理服务，处理本地文件操作
   - 功能：浏览、创建、编辑、删除文件和目录
   - 命令示例：`local ls`, `local edit file.txt`

2. **systemInfo**：系统信息服务，获取本地系统状态
   - 功能：获取CPU、内存、磁盘、网络等信息
   - 命令示例：`info cpu`, `info memory`

3. **toolRunner**：工具运行服务，执行本地工具和脚本
   - 功能：运行本地安装的工具和脚本
   - 命令示例：`tool docker ps`, `tool curl example.com`

4. **scriptManager**：脚本管理服务，用于管理和执行脚本
   - 功能：创建、编辑、执行、调试脚本
   - 命令示例：`script run backup.sh`, `script edit deploy.js`

## MCP服务注册

MCP服务需要通过注册机制使系统能够识别和调用它们：

```typescript
// MCP服务注册接口
interface MCPServiceRegistration {
  // 服务名称
  name: MCPServiceName;
  
  // 服务ID（可选，默认为随机生成）
  id?: string;
  
  // 服务描述
  description: string;
  
  // 服务优先级（1-10，默认为5）
  priority?: number;
  
  // 服务实例
  service: IMCPService;
  
  // 命令匹配模式（用于自动识别是否由该服务处理命令）
  commandPatterns?: RegExp[];
}

// MCP服务注册器
class MCPServiceRegistry {
  private services: Map<string, MCPServiceRegistration> = new Map();
  
  // 注册服务
  registerService(registration: MCPServiceRegistration): string {
    const id = registration.id || generateUniqueId();
    this.services.set(id, { ...registration, id });
    return id;
  }
  
  // 获取服务
  getService(id: string): IMCPService | null {
    const registration = this.services.get(id);
    return registration ? registration.service : null;
  }
  
  // 根据命令查找合适的服务
  findServiceForCommand(command: string): { 
    service: IMCPService; 
    serviceInfo: MCPServiceInfo;
  } | null {
    // 实现服务匹配逻辑
  }
}
```

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
  shouldChangeTerminalState: false,
  newTerminalState: 'normal',
  modifiedCommand: command,
  explanation: `通过MCP执行命令: ${command}`,
  feedback: {
    needsFeedback: false,
    message: ''
  },
  analysis: {
    commandPurpose: '执行本地MCP操作',
    potentialIssues: [],
    alternatives: []
  },
  mcpInfo: {
    serviceName: 'fileManager', // 或其他服务名称
    serviceId: 'unique-service-id', // 可选
    params: {
      // 服务特定参数
      path: '/home/user',
      recursive: true
    },
    priority: 5 // 默认优先级
  }
}
```

## MCP命令处理流程

在WebSocket服务中，MCP命令的处理流程需要更新为：

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
    if (!analysisResult.mcpInfo) {
      throw new Error('MCP命令缺少服务信息');
    }
    
    // 获取MCP服务
    const mcpService = mcpServiceRegistry.getService(
      analysisResult.mcpInfo.serviceId || 
      mcpServiceRegistry.findServiceByName(analysisResult.mcpInfo.serviceName)
    );
    
    if (!mcpService) {
      throw new Error(`找不到MCP服务: ${analysisResult.mcpInfo.serviceName}`);
    }
    
    // 执行MCP命令
    const mcpResult = await mcpService.executeCommand(
      analysisResult.modifiedCommand,
      sessionInfo.sessionId,
      analysisResult.mcpInfo.params
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

为了支持MCP服务选择，我们需要进一步完善命令分析提示词：

```markdown
## MCP命令识别和服务选择

MCP命令是指需要由本地工具处理而不是发送到SSH服务器的命令。可通过以下方式识别:

1. 命令前缀: 以`$mcp`, `#mcp`或`@mcp`开头的命令
2. 命令模式: 匹配以下模式的命令:
   - `local [ls|cd|cp|mv|rm|mkdir|touch]...` - 本地文件操作 (fileManager服务)
   - `tool ...` 或 `tools ...` - 工具调用 (toolRunner服务)
   - `info ...` - 系统信息查询 (systemInfo服务)
   - `script ...` - 脚本管理 (scriptManager服务)

对于MCP命令，需要确定以下信息:
- commandType设置为"mcp"
- shouldExecute设置为true
- mcpInfo对象包含:
  - serviceName: 选择合适的服务类型 (fileManager|systemInfo|toolRunner|scriptManager)
  - params: 从命令中提取的参数
  - priority: 默认为5
```

## 未来扩展

1. **MCP命令注册系统**：允许插件注册新的MCP命令
2. **MCP命令权限管理**：控制不同用户对MCP命令的访问权限
3. **MCP命令别名**：提供常用MCP命令的简短别名
4. **MCP命令帮助系统**：为用户提供MCP命令的帮助信息 