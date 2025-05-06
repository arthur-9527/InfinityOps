# MCP服务器接入指南

本文档详细描述了如何开发和接入符合InfinityOps要求的MCP（Master Control Program）服务器。

## 目录

1. [概述](#概述)
2. [MCP服务器的作用](#mcp服务器的作用)
3. [接口规范](#接口规范)
4. [开发指南](#开发指南)
5. [配置选项](#配置选项)
6. [安全最佳实践](#安全最佳实践)
7. [故障排除](#故障排除)

## 概述

MCP（Master Control Program）是InfinityOps系统的核心组件之一，负责处理用户命令、分析需求并提供智能响应。通过接入自定义的MCP服务器，您可以扩展系统的功能，提供特定领域的专业服务。

## MCP服务器的作用

MCP服务器主要负责以下功能：

- 分析用户输入的命令和请求
- 判断是否可以处理特定请求
- 处理用户命令并返回结果
- 处理需要用户确认的操作

## 接口规范

### 基本要求

要成功接入InfinityOps系统，您的MCP服务器需要实现以下RESTful API接口：

#### 1. 状态检查 (GET /api/status)

用于检查服务器是否在线及其当前状态。

**请求：**
```
GET /api/status
```

**响应：**
```json
{
  "status": "online",
  "version": "1.0.0",
  "capabilities": ["command-analysis", "natural-language"]
}
```

#### 2. 能力检查 (POST /api/can-handle)

用于判断服务器是否能处理特定请求，返回一个0到1之间的置信度分数。

**请求：**
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

**响应：**
```json
{
  "score": 0.85
}
```

置信度分数说明：
- 0：完全不能处理
- 0.1-0.3：低置信度，可能可以处理
- 0.4-0.7：中等置信度，可以处理但不是最佳选择
- 0.8-1.0：高置信度，非常适合处理此请求

#### 3. 处理请求 (POST /api/process)

处理用户请求并返回处理结果。

**请求：**
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

**响应：**
```json
{
  "type": "info",
  "content": "处理结果内容",
  "success": true,
  "metadata": {
    "key": "value"
  },
  "shouldProcess": true,
  "requireConfirmation": false,
  "confirmationMessage": "",
  "isAwaitingConfirmation": false
}
```

响应字段说明：
- `type`: 响应类型，可以是 "info"、"error"、"warning"、"success" 等
- `content`: 响应内容，通常是文本消息
- `success`: 表示请求是否成功处理
- `metadata`: 附加信息，可以包含任何相关数据
- `shouldProcess`: 是否需要进一步处理这个响应
- `requireConfirmation`: 是否需要用户确认
- `confirmationMessage`: 如果需要确认，显示给用户的确认消息
- `isAwaitingConfirmation`: 是否正在等待用户确认

#### 4. 处理确认 (POST /api/handle-confirmation)

处理用户对之前请求的确认响应。

**请求：**
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

**响应：**
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

### 数据模型

#### MCPRequestContext

```typescript
interface MCPRequestContext {
  sessionId: string;
  userId?: string;
  requestId: string;
  input: string;
  path?: string;
  timestamp: number;
  additionalContext?: Record<string, any>;
}
```

#### MCPResponse

```typescript
interface MCPResponse {
  type: string;
  content: string;
  success: boolean;
  metadata?: Record<string, any>;
  shouldProcess?: boolean;
  requireConfirmation?: boolean;
  confirmationMessage?: string;
  isAwaitingConfirmation?: boolean;
}
```

## 开发指南

### 技术栈选择

您可以使用任何支持HTTP/HTTPS和JSON的技术栈开发MCP服务器，例如：

- Node.js + Express
- Python + Flask/FastAPI
- Java + Spring Boot
- Go + Gin
- Ruby on Rails
- .NET Core

### 示例实现（Node.js + Express）

```javascript
const express = require('express');
const bodyParser = require('body-parser');
const app = express();
const port = 3001;

app.use(bodyParser.json());

// 状态检查
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '1.0.0',
    capabilities: ['command-analysis', 'natural-language']
  });
});

// 能力检查
app.post('/api/can-handle', (req, res) => {
  const { context } = req.body;
  const input = context.input.toLowerCase();
  
  // 示例：检查是否可以处理此请求
  let score = 0;
  if (input.includes('文件') || input.includes('file')) {
    score = 0.9; // 高置信度
  } else if (input.includes('目录') || input.includes('folder')) {
    score = 0.8; // 高置信度
  }
  
  res.json({ score });
});

// 处理请求
app.post('/api/process', (req, res) => {
  const { context } = req.body;
  const input = context.input;
  
  // 示例：处理请求并返回结果
  const response = {
    type: 'info',
    content: `已处理请求: ${input}`,
    success: true,
    metadata: {
      processedAt: new Date().toISOString()
    }
  };
  
  res.json(response);
});

// 处理确认
app.post('/api/handle-confirmation', (req, res) => {
  const { context, isConfirmed } = req.body;
  
  // 示例：处理确认
  const response = {
    type: 'info',
    content: isConfirmed ? '操作已确认并执行' : '操作已取消',
    success: true
  };
  
  res.json(response);
});

app.listen(port, () => {
  console.log(`MCP服务器运行在 http://localhost:${port}`);
});
```

### Python + FastAPI 示例实现

```python
from fastapi import FastAPI, Body
from pydantic import BaseModel
from typing import Dict, List, Any, Optional
import uvicorn
from datetime import datetime

app = FastAPI(title="MCP服务器")

class MCPRequestContext(BaseModel):
    sessionId: str
    userId: Optional[str] = None
    requestId: str
    input: str
    path: Optional[str] = None
    timestamp: int
    additionalContext: Optional[Dict[str, Any]] = None

class CanHandleRequest(BaseModel):
    context: MCPRequestContext

class ConfirmationRequest(BaseModel):
    context: MCPRequestContext
    isConfirmed: bool

class MCPResponse(BaseModel):
    type: str
    content: str
    success: bool
    metadata: Optional[Dict[str, Any]] = None
    shouldProcess: Optional[bool] = None
    requireConfirmation: Optional[bool] = None
    confirmationMessage: Optional[str] = None
    isAwaitingConfirmation: Optional[bool] = None

@app.get("/api/status")
def get_status():
    return {
        "status": "online",
        "version": "1.0.0",
        "capabilities": ["command-analysis", "natural-language"]
    }

@app.post("/api/can-handle")
def can_handle(request: CanHandleRequest):
    input_text = request.context.input.lower()
    
    # 示例：检查是否可以处理此请求
    score = 0
    if "文件" in input_text or "file" in input_text:
        score = 0.9  # 高置信度
    elif "目录" in input_text or "folder" in input_text:
        score = 0.8  # 高置信度
    
    return {"score": score}

@app.post("/api/process", response_model=MCPResponse)
def process_request(request: CanHandleRequest):
    input_text = request.context.input
    
    # 示例：处理请求并返回结果
    return MCPResponse(
        type="info",
        content=f"已处理请求: {input_text}",
        success=True,
        metadata={"processedAt": datetime.now().isoformat()}
    )

@app.post("/api/handle-confirmation", response_model=MCPResponse)
def handle_confirmation(request: ConfirmationRequest):
    # 示例：处理确认
    return MCPResponse(
        type="info",
        content="操作已确认并执行" if request.isConfirmed else "操作已取消",
        success=True
    )

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=3001)
```

## 配置选项

在InfinityOps系统中接入您的MCP服务器需要以下配置：

```typescript
const remoteMcpService = registerRemoteMCPService(
  'my-custom-mcp',          // 唯一ID
  '我的自定义MCP服务',      // 用户友好的名称
  '处理特定领域的命令和请求', // 描述
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
```

### 配置参数详解

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `url` | MCP服务器的API地址 | 必填 |
| `apiKey` | 用于认证的API密钥 | 可选 |
| `timeout` | API请求超时时间（毫秒） | 10000 |
| `maxRetries` | 请求失败时的最大重试次数 | 3 |
| `secure` | 是否使用HTTPS安全连接 | true |
| `headers` | 额外的HTTP请求头 | {} |
| `verifySsl` | 是否验证SSL证书（HTTPS连接时） | true |

## 安全最佳实践

开发MCP服务器时，请遵循以下安全最佳实践：

1. **使用HTTPS**：所有生产环境的MCP服务器都应使用HTTPS加密通信
2. **实现身份验证**：使用API密钥或JWT等机制验证请求的合法性
3. **实施速率限制**：防止恶意用户发送大量请求
4. **输入验证**：始终验证所有输入参数，防止注入攻击
5. **最小权限原则**：MCP服务器只应具有完成任务所需的最小权限
6. **日志审计**：记录所有API调用，便于审计和故障排查
7. **定期更新**：保持所有依赖库的更新，修复已知安全漏洞

### 安全配置示例（Node.js）

```javascript
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();

// 使用Helmet增强安全性
app.use(helmet());

// 实施API密钥验证
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: '未授权访问' });
  }
  next();
});

// 实施速率限制
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 100, // 每个IP在windowMs时间内最多允许100个请求
  message: '请求过于频繁，请稍后再试'
});
app.use('/api/', limiter);

// 其余代码...
```

## 故障排除

在MCP服务器接入过程中可能遇到的常见问题及解决方法：

### 连接问题

**问题**：InfinityOps系统无法连接到MCP服务器  
**解决方法**：
- 检查MCP服务器是否正常运行
- 确认URL配置是否正确
- 检查网络防火墙是否允许连接
- 如果使用HTTPS，确认SSL证书是否有效

### 认证失败

**问题**：认证失败，API返回401错误  
**解决方法**：
- 确认API密钥配置正确
- 检查API密钥是否已过期
- 确认请求头中包含正确的认证信息

### 响应格式错误

**问题**：InfinityOps系统报告MCP响应格式无效  
**解决方法**：
- 确保响应严格遵循MCPResponse接口规范
- 检查JSON格式是否正确
- 验证所有必填字段是否存在

### 性能问题

**问题**：MCP服务器响应缓慢  
**解决方法**：
- 优化服务器代码
- 增加服务器资源（CPU、内存）
- 考虑实施缓存机制
- 使用负载均衡分散请求

### 调试技巧

1. 启用详细日志记录
2. 使用工具如Postman测试API端点
3. 实施健康检查端点监控服务状态
4. 使用性能分析工具找出瓶颈

---

接入MCP服务器可以极大地扩展InfinityOps系统的功能，使其能够处理特定领域的专业任务。如有任何问题，请参考本文档或联系系统管理员获取支持。 