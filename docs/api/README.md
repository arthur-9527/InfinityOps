# InfinityOps Backend API 文档

## API 端点

### 认证相关

#### POST /api/auth/login
登录并获取访问令牌

**请求体**
```json
{
  "username": "string",
  "password": "string"
}
```

**响应**
```json
{
  "token": "string",
  "user": {
    "id": "string",
    "username": "string"
  }
}
```

#### POST /api/auth/logout
注销当前会话

### SSH 会话管理

#### POST /api/sessions
创建新的 SSH 会话

**请求体**
```json
{
  "host": "string",
  "port": "number",
  "username": "string",
  "password": "string",
  "privateKey": "string (optional)"
}
```

**响应**
```json
{
  "sessionId": "string",
  "wsUrl": "string"
}
```

#### GET /api/sessions
获取当前用户的所有活动会话

**响应**
```json
{
  "sessions": [
    {
      "id": "string",
      "host": "string",
      "username": "string",
      "createdAt": "string",
      "status": "string"
    }
  ]
}
```

#### DELETE /api/sessions/:sessionId
终止指定的 SSH 会话

## WebSocket 接口

### 终端会话

**连接 URL**: `ws://localhost:3002/terminal/:sessionId`

**认证**:
- 需要在 URL 查询参数中包含 token
- 例如: `ws://localhost:3002/terminal/123?token=xxx`

### 消息格式

#### 客户端到服务器

```typescript
interface ClientMessage {
  type: 'input' | 'resize' | 'ping';
  data: {
    // 对于 input 类型
    command?: string;
    // 对于 resize 类型
    cols?: number;
    rows?: number;
  };
}
```

#### 服务器到客户端

```typescript
interface ServerMessage {
  type: 'output' | 'error' | 'pong';
  data: {
    // 对于 output 类型
    output?: string;
    // 对于 error 类型
    error?: string;
  };
}
```

## 错误处理

所有 API 错误响应格式如下：

```json
{
  "error": {
    "code": "string",
    "message": "string"
  }
}
```

## 状态码

- 200: 成功
- 201: 创建成功
- 400: 请求参数错误
- 401: 未认证
- 403: 未授权
- 404: 资源不存在
- 500: 服务器错误

## 认证

除了登录接口外，所有 API 请求都需要在 Header 中包含 JWT token：

```
Authorization: Bearer <token>
```

## 会话管理

- 会话超时时间: 1小时
- 最大并发会话数: 每用户 5 个
- 心跳间隔: 30秒 