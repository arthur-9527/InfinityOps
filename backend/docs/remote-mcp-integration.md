# 远程MCP服务器集成指南

本文档描述了如何将外部MCP（Master Control Program）服务器集成到InfinityOps系统中。

## 概述

InfinityOps系统允许通过API连接到远程MCP服务器，这使得系统能够利用外部的命令处理、自然语言理解和其他智能服务。通过集成远程MCP服务器，可以扩展系统的功能而无需修改核心代码。

## 远程MCP服务器要求

要集成的远程MCP服务器需要符合以下要求：

1. 提供RESTful API接口
2. 支持以下API端点：
   - `/api/status` - 获取服务器状态（GET）
   - `/api/can-handle` - 检查是否可以处理请求（POST）
   - `/api/process` - 处理请求（POST）
   - `/api/handle-confirmation` - 处理确认响应（POST）
3. 返回符合MCPResponse接口的JSON响应

## 集成步骤

### 1. 在代码中注册远程MCP服务

使用`registerRemoteMCPService`函数注册远程MCP服务：

```typescript
import { registerRemoteMCPService } from './modules/mcp';

// 注册远程MCP服务
const remoteMcpService = registerRemoteMCPService(
  'remote-command-analysis', // 唯一ID
  '远程命令分析服务',        // 用户友好的名称
  '连接到外部命令分析服务器', // 描述
  {
    url: 'https://example.com/mcp-api', // 远程服务器URL
    apiKey: 'your-api-key',             // API密钥（如需要）
    timeout: 10000,                     // 超时时间（毫秒）
    maxRetries: 3,                      // 最大重试次数
    secure: true,                       // 是否使用HTTPS
    headers: {                          // 额外的请求头
      'X-Custom-Header': 'value'
    },
    verifySsl: true                     // 是否验证SSL证书
  },
  40 // 优先级（数字越小优先级越高）
);

// 稍后可以更新配置
await remoteMcpService.updateConfig({
  url: 'https://new-example.com/mcp-api',
  timeout: 15000
});

// 测试连接
const isConnected = await remoteMcpService.testConnection();
console.log(`连接状态: ${isConnected ? '成功' : '失败'}`);

// 获取服务状态
const status = await remoteMcpService.getStatus();
console.log('服务状态:', status);

// 取消注册服务（当不再需要时）
await unregisterMCPService('remote-command-analysis');
```

### 2. 远程MCP API规范

#### 状态检查 (`GET /api/status`)

请求：
```
GET /api/status
```

响应：
```json
{
  "status": "online",
  "version": "1.0.0",
  "capabilities": ["command-analysis", "natural-language"]
}
```

#### 能力检查 (`POST /api/can-handle`)

请求：
```json
{
  "context": {
    "sessionId": "session-123",
    "userId": "user-456",
    "requestId": "req-789",
    "input": "用户输入内容",
    "path": "/home/user",
    "timestamp": 1631234567890,
    "additionalContext": {}
  }
}
```

响应：
```json
{
  "score": 0.85
}
```

#### 处理请求 (`POST /api/process`)

请求：
```json
{
  "context": {
    "sessionId": "session-123",
    "userId": "user-456",
    "requestId": "req-789",
    "input": "用户输入内容",
    "path": "/home/user",
    "timestamp": 1631234567890,
    "additionalContext": {}
  }
}
```

响应：
```json
{
  "type": "info",
  "content": "处理结果内容",
  "success": true,
  "metadata": {
    "key": "value"
  },
  "shouldProcess": true,
  "requireConfirmation": false
}
```

#### 处理确认 (`POST /api/handle-confirmation`)

请求：
```json
{
  "context": {
    "sessionId": "session-123",
    "userId": "user-456",
    "requestId": "req-789",
    "input": "确认内容",
    "path": "/home/user",
    "timestamp": 1631234567890,
    "additionalContext": {}
  },
  "isConfirmed": true
}
```

响应：
```json
{
  "type": "info",
  "content": "确认处理结果",
  "success": true,
  "metadata": {
    "key": "value"
  }
}
```

## 注意事项

1. 远程MCP服务应确保响应符合MCPResponse接口规范
2. 建议实现健康检查和错误处理机制
3. 考虑添加认证和授权机制以保证安全
4. 监控API调用性能，避免延迟影响用户体验
5. 处理网络故障情况下的优雅降级 