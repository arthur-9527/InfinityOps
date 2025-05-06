# 中国天气查询MCP服务接入指南

本文档详细描述了如何开发和部署专门用于查询中国天气的MCP（Master Control Program）服务器，并将其接入InfinityOps系统。

## 目录

1. [概述](#概述)
2. [天气查询服务功能](#天气查询服务功能)
3. [接口规范](#接口规范)
4. [部署指南](#部署指南)
5. [使用示例](#使用示例)
6. [常见问题](#常见问题)

## 概述

中国天气查询MCP服务是InfinityOps系统的一个专用服务扩展，能够接收用户的天气查询请求，访问天气数据源，并返回格式化的天气信息。该服务支持全国各省市的天气查询、多日天气预报以及天气预警信息。

## 天气查询服务功能

中国天气查询MCP服务提供以下核心功能：

- **实时天气查询**：查询指定城市的当前天气状况
- **天气预报**：提供未来1-7天的天气预报
- **空气质量**：提供空气质量指数(AQI)和污染物信息
- **天气预警**：提供极端天气预警信息
- **生活指数**：提供穿衣、出行、运动等生活建议
- **方言本地化**：支持部分地区的方言表达（如：广东话、四川话等）

## 接口规范

### 基本接口

天气查询MCP服务实现了标准的MCP服务接口：

- GET `/api/status` - 状态检查
- POST `/api/can-handle` - 能力检查
- POST `/api/process` - 处理请求
- POST `/api/handle-confirmation` - 处理确认

### 特有接口

除标准接口外，天气查询MCP服务还提供以下专用接口：

- GET `/api/weather/cities` - 获取支持的城市列表
- GET `/api/weather/current/{city}` - 获取指定城市的当前天气
- GET `/api/weather/forecast/{city}/{days}` - 获取指定城市的天气预报
- GET `/api/weather/air-quality/{city}` - 获取指定城市的空气质量
- GET `/api/weather/alerts/{province}` - 获取指定省份的天气预警

### 请求识别

天气查询MCP服务能识别的请求模式包括：

- "查询XX天气"、"XX天气怎么样"
- "XX明天会下雨吗"、"XX未来一周天气"
- "XX的气温/温度是多少"
- "XX的空气质量/污染指数"
- "XX有没有发布暴雨/台风预警"

以上模式中，XX代表中国的城市、区县或省份名称。

### 响应格式

对于天气查询请求，服务将返回标准的MCPResponse格式，其中metadata字段包含了详细的天气信息：

```json
{
  "type": "info",
  "content": "北京今天天气晴朗，当前温度25℃，空气质量良好。",
  "success": true,
  "metadata": {
    "weatherInfo": {
      "city": "北京",
      "date": "2023-06-01",
      "weather": "晴",
      "temperature": {
        "current": 25,
        "low": 18,
        "high": 28
      },
      "humidity": 45,
      "windDirection": "东南风",
      "windForce": "3级",
      "airQuality": {
        "aqi": 75,
        "level": "良",
        "description": "空气质量可接受，但某些污染物可能对极少数异常敏感人群健康有较弱影响"
      },
      "advice": "天气不错，适合户外活动，建议涂抹防晒霜"
    }
  }
}
```

## 部署指南

### 环境要求

- Node.js 14+ 或 Python 3.8+
- 2GB+ RAM
- 1GB+ 可用磁盘空间
- 支持 HTTP/HTTPS 的网络环境
- 可选：Redis 缓存服务（提高性能）

### 安装步骤

1. 克隆代码仓库：
   ```bash
   git clone https://github.com/infinityops/weather-mcp-server.git
   cd weather-mcp-server
   ```

2. 安装依赖：
   ```bash
   # Node.js版本
   npm install
   
   # 或Python版本
   pip install -r requirements.txt
   ```

3. 配置服务：
   ```bash
   cp .env.example .env
   # 编辑.env文件，设置API密钥、天气数据源等参数
   ```

4. 启动服务：
   ```bash
   # Node.js版本
   npm start
   
   # 或Python版本
   python app.py
   ```

5. 验证服务：
   ```bash
   curl http://localhost:3001/api/status
   ```

### 配置天气数据源

天气查询MCP服务支持以下天气数据源：

1. **和风天气API**
   - 申请地址：[https://dev.qweather.com/](https://dev.qweather.com/)
   - 配置方式：设置环境变量 `WEATHER_API_KEY=你的API密钥`

2. **中国天气网**
   - 数据获取方式：网页爬虫
   - 配置方式：设置环境变量 `USE_WEATHER_CRAWLER=true`

3. **中国气象局公共气象服务中心**
   - 申请地址：[http://data.cma.cn/](http://data.cma.cn/)
   - 配置方式：设置环境变量 `CMA_API_KEY=你的API密钥`

推荐使用和风天气API作为主要数据源，其提供稳定且全面的天气数据。

## 使用示例

### 注册到InfinityOps

将天气查询MCP服务注册到InfinityOps系统中：

```typescript
import { registerRemoteMCPService } from '../../modules/mcp';

// 注册天气查询MCP服务
const weatherMcpService = registerRemoteMCPService(
  'weather-query',
  '中国天气查询服务',
  '提供全国各地天气查询、预报及预警信息',
  {
    url: 'http://localhost:3001',
    apiKey: 'YOUR_WEATHER_MCP_API_KEY',
    timeout: 5000,
    maxRetries: 2
  },
  30 // 优先级
);

// 测试连接
const isConnected = await weatherMcpService.testConnection();
console.log(`天气服务连接状态: ${isConnected ? '成功' : '失败'}`);
```

### 用户查询示例

用户可以通过以下方式查询天气：

```
查询北京天气
上海明天会下雨吗
广州未来三天天气预报
成都的空气质量怎么样
杭州现在温度是多少
```

## 常见问题

### 为什么某些城市查不到天气？

可能的原因：
- 城市名称不在支持列表中
- 天气数据源暂时无法访问
- 城市名称有歧义（如江苏徐州vs山东徐州）

解决方法：尝试提供更详细的地址信息，例如"江苏省徐州市"。

### 天气数据更新频率如何？

- 实时天气数据：每1小时更新一次
- 天气预报数据：每天更新4次（早6点、中12点、晚6点、夜12点）
- 极端天气预警：实时更新

### 如何处理地名识别错误？

问题：用户输入"查询三亚天气"，但系统识别为"查询三个亚洲的天气"。

解决方法：
1. 使用地名词典进行精确匹配
2. 引入中文分词和地名实体识别
3. 对于识别模糊的情况，提供确认机制

### 如何提高响应速度？

1. 使用Redis缓存常用城市的天气数据
2. 批量预取热门城市的天气数据
3. 配置CDN加速天气图标等静态资源
4. 优化城市名称识别算法
5. 使用异步请求处理多个并发查询 