# 中国天气查询MCP服务器

这是一个符合InfinityOps系统MCP接口规范的天气查询服务器，可以提供中国各地的天气信息、预报和空气质量数据。

## 功能特点

- 实时天气查询
- 未来天气预报
- 空气质量指数查询
- 天气预警信息
- 生活建议

## 安装与运行

### 环境要求

- Node.js 14+ 
- npm 或 yarn

### 安装步骤

1. 克隆或下载本仓库
2. 安装依赖

```bash
cd mcp_server
npm install
```

3. 配置环境变量

```bash
cp env.example .env
# 编辑.env文件，设置API密钥和其他配置
```

4. 启动服务器

```bash
npm start
```

开发模式：

```bash
npm run dev
```

### 验证安装

服务器启动后，可以通过以下命令验证是否正常工作：

```bash
curl http://localhost:3001/api/status
```

正常情况下，应该返回类似以下的JSON响应：

```json
{
  "status": "online",
  "version": "1.0.0",
  "capabilities": ["weather-query", "weather-forecast", "air-quality", "weather-alert"],
  "uptime": 123,
  "requestsProcessed": 0
}
```

## 接入InfinityOps系统

参见 [mcp-server-integration.md](./mcp-server-integration.md) 文档了解如何将此服务接入InfinityOps系统。

## API参考

### 标准MCP接口

- `GET /api/status` - 状态检查
- `POST /api/can-handle` - 能力检查
- `POST /api/process` - 处理请求
- `POST /api/handle-confirmation` - 处理确认

### 天气特有接口

- `GET /api/weather/cities` - 获取支持的城市列表
- `GET /api/weather/current/:city` - 获取指定城市的当前天气
- `GET /api/weather/forecast/:city/:days` - 获取指定城市的天气预报
- `GET /api/weather/air-quality/:city` - 获取指定城市的空气质量
- `GET /api/weather/alerts/:province` - 获取指定省份的天气预警

## 数据来源

本服务支持多种天气数据源：

1. 和风天气 API
2. 中国天气网爬虫
3. 中国气象局公共气象服务中心

## 许可证

ISC 