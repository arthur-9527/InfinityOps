# Weather MCP Server

一个基于FastMCP实现的天气查询 MCP 服务器，使用和风天气API获取中国城市的天气信息。

## 功能

该服务器提供以下天气查询工具：

- **beijing_weather** - 获取北京市的实时天气信息
- **city_weather** - 获取指定中国城市的天气信息，支持实时天气、7天预报和24小时预报
- **list_chinese_cities** - 列出所有支持的中国主要城市

## 安装和配置

```bash
# 安装依赖
npm install

# 创建.env文件并添加和风天气API密钥
echo "WEATHER_API_KEY=your_api_key_here" > .env

# 构建项目
npm run build
```

### 获取和风天气API密钥

1. 访问[和风天气开发平台](https://dev.qweather.com/)
2. 注册并创建一个应用
3. 获取API Key
4. 将API Key添加到`.env`文件中

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
    "weather-mcp": {
      "command": "/path/to/weather-mcp/build/index.js"
    }
  }
}
```

确保将 `/path/to/weather-mcp/build/index.js` 替换为您实际的文件路径。

## 使用示例

一旦在 MCP 支持的客户端（如 Claude Desktop）中连接了服务器，你可以使用以下方式调用天气查询功能：

**获取北京天气**:
```
请使用weather-mcp服务器查询北京的天气
```

**获取指定城市天气**:
```
请使用weather-mcp服务器查询上海的实时天气
```

**获取天气预报**:
```
请使用weather-mcp服务器查询广州的天气预报
```

**查看支持的城市列表**:
```
请使用weather-mcp服务器列出支持的中国城市
```

## 天气查询参数

`city_weather` 工具支持以下参数：

- **city** - 城市名称，例如：beijing、shanghai、guangzhou等
- **type** - 查询类型，可选值：
  - `now` - 实时天气（默认）
  - `forecast` - 7天天气预报
  - `hourly` - 24小时天气预报
  - `all` - 所有天气信息

## 技术栈

- FastMCP - MCP服务器框架
- TypeScript - 编程语言
- 和风天气API - 天气数据源

## 许可证

MIT 