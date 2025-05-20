# AI-Powered MCP Client

一个智能化的MCP客户端，可以使用自然语言与MCP服务进行交互，支持calculator-mcp和weather-mcp服务器。

## 功能特点

- **AI分析用户输入**: 系统通过AI自动分析用户的自然语言输入，理解意图并调用相应的MCP服务
- **无需菜单选择**: 用户只需输入一句自然语言指令，无需通过菜单选择服务或功能
- **多服务器支持**: 可同时连接到多个MCP服务器（计算器服务器和天气服务器）
- **自动参数提取**: 从用户输入中自动提取必要的参数，如计算数字、城市名称等

## 支持的服务

- **计算器服务**：执行数学计算操作（加法、减法、乘法、除法）
- **天气服务**：查询中国城市的天气信息，获取支持的中国城市列表

## 配置

客户端使用`config.json`文件来配置MCP服务器的连接信息：

```json
{
  "mcpServers": {
    "calculator-mcp": {
      "command": "/path/to/calculator-mcp/build/index.js"
    },
    "weather-mcp": {
      "command": "/path/to/weather-mcp/build/index.js"
    }
  }
}
```

确保将服务器路径替换为实际的路径。

### AI服务配置

客户端支持使用Ollama或OpenAI API进行自然语言分析，配置在`.env`文件中：

```
# Ollama服务配置
OLLAMA_API_URL=http://localhost:11434/api
OLLAMA_MODEL=gemma3:latest

# 默认为本地Ollama服务，如需使用OpenAI API，取消下面注释并填入密钥
# OPENAI_API_KEY=your_openai_api_key
# OPENAI_API_URL=https://api.openai.com/v1
```

## 安装和构建

```bash
# 安装依赖
npm install

# 构建项目
npm run build
```

## 运行

```bash
# 直接运行构建后的代码
npm start

# 或者开发模式运行
npm run dev
```

## 使用示例

运行客户端后，可以直接输入自然语言指令：

```
欢迎使用智能 MCP 助手
您可以直接输入自然语言请求，系统将自动分析并调用相应的服务
示例:
- "北京今天的天气怎么样？"
- "帮我计算一下 23 加 45 等于多少"
- "上海温度如何？"
- "15乘以7"
输入 "退出" 或 "exit" 结束程序

系统就绪，您现在可以直接输入您的请求

> 今天北京天气怎么样？
正在处理您的请求...

天气信息: 北京市实时天气信息:
- 温度: 25°C
- 体感温度: 26°C
...

> 56加89等于多少
正在处理您的请求...

计算结果: 56 + 89 = 145

> 上海明天的天气预报
正在处理您的请求...

天气信息: SHANGHAI 的天气信息:
- 预报: 晴转多云
- 最高温度: 26°C
- 最低温度: 19°C
...
```

## 技术实现

- **自然语言分析**:
  - 使用AI模型(Ollama或OpenAI)分析用户输入
  - 识别用户意图并自动选择合适的MCP服务和工具
  - 从用户输入提取必要参数

- **多服务器管理**:
  - 动态连接到多个MCP服务器
  - 自动发现并加载可用工具
  - 根据AI分析结果调用相应的工具

## 技术栈

- @modelcontextprotocol/sdk - MCP客户端SDK
- OpenAI / Ollama - AI自然语言处理
- TypeScript - 编程语言
- dotenv - 环境变量管理

## 代码结构

- `src/index.ts` - 主程序入口，处理用户交互及服务调用
- `src/aiService.ts` - AI分析服务，处理自然语言理解
- `MCPClientManager` - 管理多个MCP服务器连接的类

## 许可证

MIT 