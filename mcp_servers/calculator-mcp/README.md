# Calculator MCP Server

一个简单的计算器 MCP 服务器，使用 FastMCP 框架实现。

## 功能

该服务器提供以下数学计算工具：

- **add** - 加法运算
- **subtract** - 减法运算
- **multiply** - 乘法运算
- **divide** - 除法运算（除数不能为0）

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

## 在 Claude Desktop 中使用

在 Claude Desktop 的配置文件 `claude_desktop_config.json` 中添加以下配置：

```json
{
  "mcpServers": {
    "calculator-mcp": {
      "command": "/path/to/calculator-mcp/build/index.js"
    }
  }
}
```

确保将 `/path/to/calculator-mcp/build/index.js` 替换为您实际的文件路径。

## 使用示例

一旦在 MCP 支持的客户端（如 Claude Desktop）中连接了服务器，你可以使用以下方式调用计算功能：

**加法运算**:
```
请使用calculator-mcp服务器计算 5 + 3
```

**减法运算**:
```
请使用calculator-mcp服务器计算 10 - 7
```

**乘法运算**:
```
请使用calculator-mcp服务器计算 6 × 8
```

**除法运算**:
```
请使用calculator-mcp服务器计算 20 ÷ 4
```

## 开发

该项目使用 TypeScript 开发，构建产物为 JavaScript 文件。

### 技术栈

- FastMCP - MCP服务器框架
- TypeScript - 编程语言
- Zod - 数据验证库

## 许可证

MIT 