/**
 * 中国天气查询MCP服务器
 * 
 * 此服务器实现了标准的MCP接口，用于查询中国各地的天气信息
 */

import express from 'express';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { 
  MCPRequestContext, 
  MCPResponse, 
  CanHandleResponse,
  StatusResponse,
  WeatherInfo
} from './remote-mcp.interface';

// 加载环境变量
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const weatherApiKey = process.env.WEATHER_API_KEY || 'demo_key';
const weatherApiBase = 'https://devapi.qweather.com/v7';

// 启动时间
const startTime = Date.now();
let requestsProcessed = 0;

// 中间件
app.use(cors());
app.use(express.json());

// 请求日志中间件
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// API密钥验证中间件
app.use((req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  // 跳过状态检查的验证要求
  if (req.method === 'GET' && req.path === '/api/status') {
    return next();
  }
  
  // 验证API密钥
  if (!apiKey || apiKey !== process.env.MCP_API_KEY) {
    if (process.env.NODE_ENV === 'development') {
      // 开发环境跳过验证
      console.warn('开发环境: 跳过API密钥验证');
      return next();
    }
    return res.status(401).json({
      type: 'error',
      content: '未授权访问，请提供有效的API密钥',
      success: false
    });
  }
  
  next();
});

/**
 * 状态检查端点
 */
app.get('/api/status', (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);
  
  const statusResponse: StatusResponse = {
    status: 'online',
    version: '1.0.0',
    capabilities: [
      'weather-query', 
      'weather-forecast', 
      'air-quality',
      'weather-alert'
    ],
    uptime,
    requestsProcessed
  };
  
  res.json(statusResponse);
});

/**
 * 能力检查端点
 */
app.post('/api/can-handle', (req, res) => {
  const { context } = req.body;
  
  if (!context || !context.input) {
    return res.status(400).json({
      score: 0
    });
  }
  
  const input = context.input.toLowerCase();
  let score = 0;
  
  // 识别天气查询请求
  if (containsWeatherQuery(input)) {
    const city = extractCity(input);
    if (city) {
      score = 0.95; // 高置信度
    } else {
      score = 0.6;  // 中等置信度
    }
  }
  
  const response: CanHandleResponse = { score };
  res.json(response);
});

/**
 * 处理请求端点
 */
app.post('/api/process', async (req, res) => {
  const { context } = req.body;
  
  if (!context || !context.input) {
    return res.status(400).json(createErrorResponse('无效的请求上下文'));
  }
  
  try {
    requestsProcessed++;
    const input = context.input.toLowerCase();
    
    // 如果不是天气查询，返回错误
    if (!containsWeatherQuery(input)) {
      return res.json(createErrorResponse('无法处理非天气相关的查询'));
    }
    
    // 提取城市名称
    const city = extractCity(input);
    if (!city) {
      // 无法提取城市名称，需要用户确认
      return res.json(createConfirmationRequest(
        '请提供您要查询的城市名称',
        '我无法确定您想查询哪个城市的天气。请明确告诉我城市名称，例如"北京"、"上海"等。'
      ));
    }
    
    // 判断查询类型
    let queryType = 'current';
    if (input.includes('明天') || input.includes('tomorrow')) {
      queryType = 'forecast_1';
    } else if (input.includes('后天')) {
      queryType = 'forecast_2';
    } else if (input.includes('未来') || input.includes('一周') || input.includes('forecast')) {
      queryType = 'forecast_7';
    } else if (input.includes('空气') || input.includes('污染') || input.includes('air')) {
      queryType = 'air';
    }
    
    // 获取天气数据
    const weatherInfo = await getWeatherData(city, queryType);
    if (!weatherInfo) {
      return res.json(createErrorResponse(`无法获取${city}的天气信息，请稍后再试或检查城市名称是否正确`));
    }
    
    // 生成响应内容
    const content = formatWeatherContent(weatherInfo, queryType);
    
    // 返回响应
    const response: MCPResponse = {
      type: 'info',
      content,
      success: true,
      metadata: {
        weatherInfo,
        queryType,
        city
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('处理请求时出错:', error);
    res.json(createErrorResponse(`处理请求时发生错误: ${(error as Error).message}`));
  }
});

/**
 * 处理确认端点
 */
app.post('/api/handle-confirmation', async (req, res) => {
  const { context, isConfirmed } = req.body;
  
  if (!isConfirmed) {
    return res.json({
      type: 'info',
      content: '已取消天气查询请求',
      success: true
    });
  }
  
  try {
    // 从用户确认输入中提取城市
    const input = context.input.toLowerCase();
    const city = extractCity(input);
    
    if (!city) {
      return res.json(createErrorResponse('无法识别城市名称，请重新查询并指定城市，例如"查询北京天气"'));
    }
    
    // 获取天气数据
    const weatherInfo = await getWeatherData(city, 'current');
    if (!weatherInfo) {
      return res.json(createErrorResponse(`无法获取${city}的天气信息，请稍后再试`));
    }
    
    // 生成响应内容
    const content = formatWeatherContent(weatherInfo, 'current');
    
    // 返回响应
    const response: MCPResponse = {
      type: 'info',
      content,
      success: true,
      metadata: {
        weatherInfo,
        queryType: 'current',
        city
      }
    };
    
    res.json(response);
  } catch (error) {
    console.error('处理确认时出错:', error);
    res.json(createErrorResponse(`处理确认时发生错误: ${(error as Error).message}`));
  }
});

// 天气专用API端点

/**
 * 获取支持的城市列表
 */
app.get('/api/weather/cities', (req, res) => {
  // 这里应该返回支持的城市列表
  // 实际应用中可能来自数据库或配置文件
  res.json({
    cities: [
      { name: '北京', code: '101010100' },
      { name: '上海', code: '101020100' },
      { name: '广州', code: '101280101' },
      { name: '深圳', code: '101280601' },
      // 更多城市...
    ]
  });
});

/**
 * 获取指定城市的当前天气
 */
app.get('/api/weather/current/:city', async (req, res) => {
  try {
    const { city } = req.params;
    const weatherInfo = await getWeatherData(city, 'current');
    
    if (!weatherInfo) {
      return res.status(404).json({ error: `无法获取${city}的天气信息` });
    }
    
    res.json({ weatherInfo });
  } catch (error) {
    res.status(500).json({ error: `服务器错误: ${(error as Error).message}` });
  }
});

/**
 * 获取指定城市的天气预报
 */
app.get('/api/weather/forecast/:city/:days', async (req, res) => {
  try {
    const { city, days } = req.params;
    const weatherInfo = await getWeatherData(city, `forecast_${days}`);
    
    if (!weatherInfo) {
      return res.status(404).json({ error: `无法获取${city}的天气预报` });
    }
    
    res.json({ weatherInfo });
  } catch (error) {
    res.status(500).json({ error: `服务器错误: ${(error as Error).message}` });
  }
});

// 工具函数

/**
 * 检查输入是否包含天气查询
 */
function containsWeatherQuery(input: string): boolean {
  const weatherKeywords = [
    '天气', 'weather', 
    '气温', '温度', 'temperature', 
    '下雨', 'rain', 
    '阴晴', '预报', 'forecast',
    '空气质量', 'air quality',
    '湿度', 'humidity'
  ];
  
  return weatherKeywords.some(keyword => input.includes(keyword));
}

/**
 * 从输入中提取城市名称
 */
function extractCity(input: string): string | null {
  // 常见的中国城市列表 (简化版)
  const commonCities = [
    '北京', '上海', '广州', '深圳', '杭州', 
    '南京', '武汉', '成都', '重庆', '西安',
    '苏州', '天津', '长沙', '郑州', '青岛',
    '大连', '宁波', '厦门', '福州', '沈阳',
    '济南', '合肥', '南宁', '昆明', '南昌',
    '长春', '哈尔滨', '太原', '石家庄', '贵阳'
  ];
  
  // 尝试直接匹配城市名
  for (const city of commonCities) {
    if (input.includes(city)) {
      return city;
    }
  }
  
  // 使用正则表达式查找可能的城市名
  // 格式如: "查询XX天气", "XX的天气", "XX明天会不会下雨"
  const cityRegex = /查询([\u4e00-\u9fa5]{2,6})天气|(.{2,6})的天气|([\u4e00-\u9fa5]{2,6})(?:今天|明天|后天|未来)/;
  const match = input.match(cityRegex);
  
  if (match) {
    // 返回第一个匹配的非空捕获组
    for (let i = 1; i < match.length; i++) {
      if (match[i]) return match[i];
    }
  }
  
  return null;
}

/**
 * 获取天气数据
 * @param city 城市名称
 * @param type 查询类型: current, forecast_1, forecast_7, air
 */
async function getWeatherData(city: string, type: string): Promise<WeatherInfo | null> {
  try {
    // 这里应该实际调用天气API
    // 示例: 模拟数据返回
    
    // 随机温度和天气状况
    const weathers = ['晴', '多云', '阴', '小雨', '中雨', '大雨', '雷阵雨', '阵雨', '雾'];
    const randomWeather = weathers[Math.floor(Math.random() * weathers.length)];
    const currentTemp = Math.floor(15 + Math.random() * 20); // 15-35度
    const lowTemp = currentTemp - Math.floor(Math.random() * 5) - 3; // 比当前温度低3-8度
    const highTemp = currentTemp + Math.floor(Math.random() * 5) + 1; // 比当前温度高1-6度
    
    // 构建天气信息
    const weatherInfo: WeatherInfo = {
      city,
      date: new Date().toISOString().split('T')[0],
      weather: randomWeather,
      temperature: {
        current: currentTemp,
        low: lowTemp,
        high: highTemp
      },
      humidity: Math.floor(40 + Math.random() * 40), // 40-80%
      windDirection: ['东', '南', '西', '北', '东南', '东北', '西南', '西北'][Math.floor(Math.random() * 8)] + '风',
      windForce: Math.floor(1 + Math.random() * 6) + '级', // 1-7级
      airQuality: {
        aqi: Math.floor(30 + Math.random() * 120), // 30-150
        level: '优', // 默认优
        description: '空气质量令人满意，基本无空气污染'
      },
      advice: '今天天气不错，适合户外活动'
    };
    
    // 根据AQI更新空气质量等级和描述
    if (weatherInfo.airQuality) {
      const aqi = weatherInfo.airQuality.aqi;
      if (aqi <= 50) {
        weatherInfo.airQuality.level = '优';
        weatherInfo.airQuality.description = '空气质量令人满意，基本无空气污染';
      } else if (aqi <= 100) {
        weatherInfo.airQuality.level = '良';
        weatherInfo.airQuality.description = '空气质量可接受，但某些污染物可能对极少数异常敏感人群健康有较弱影响';
      } else if (aqi <= 150) {
        weatherInfo.airQuality.level = '轻度污染';
        weatherInfo.airQuality.description = '易感人群症状有轻度加剧，健康人群出现刺激症状';
      } else if (aqi <= 200) {
        weatherInfo.airQuality.level = '中度污染';
        weatherInfo.airQuality.description = '进一步加剧易感人群症状，可能对健康人群心脏、呼吸系统有影响';
      } else {
        weatherInfo.airQuality.level = '重度污染';
        weatherInfo.airQuality.description = '健康影响显著加剧，运动耐受力降低，健康人群普遍出现症状';
      }
    }
    
    // 根据天气状况更新建议
    if (weatherInfo.weather.includes('雨')) {
      weatherInfo.advice = '今天有雨，出门请带伞';
      if (weatherInfo.weather.includes('大雨') || weatherInfo.weather.includes('暴雨')) {
        weatherInfo.advice = '今天雨势较大，尽量减少外出';
        weatherInfo.warning = '暴雨预警，注意防范城市内涝和交通事故';
      }
    } else if (weatherInfo.weather.includes('雪')) {
      weatherInfo.advice = '今天有雪，注意保暖，路面可能湿滑';
    } else if (weatherInfo.weather === '晴' && weatherInfo.temperature.high > 30) {
      weatherInfo.advice = '天气炎热，注意防暑降温，避免长时间户外活动';
    } else if (weatherInfo.weather === '雾') {
      weatherInfo.advice = '能见度较低，驾车注意安全';
      weatherInfo.warning = '大雾预警，建议减少户外活动';
    }
    
    return weatherInfo;
  } catch (error) {
    console.error('获取天气数据时出错:', error);
    return null;
  }
}

/**
 * 格式化天气内容
 */
function formatWeatherContent(weatherInfo: WeatherInfo, queryType: string): string {
  const { city, weather, temperature, airQuality, windDirection, windForce } = weatherInfo;
  
  // 基本天气描述
  let content = `${city}今天天气${weather}，`;
  
  // 添加温度信息
  if (temperature.current) {
    content += `当前温度${temperature.current}℃，`;
  }
  content += `今日气温${temperature.low}℃~${temperature.high}℃，`;
  
  // 添加风向风力
  if (windDirection && windForce) {
    content += `${windDirection}${windForce}，`;
  }
  
  // 添加空气质量
  if (airQuality) {
    content += `空气质量${airQuality.level}，`;
  }
  
  // 添加建议
  if (weatherInfo.advice) {
    content += weatherInfo.advice;
  }
  
  // 添加警告信息
  if (weatherInfo.warning) {
    content += `\n⚠️ ${weatherInfo.warning}`;
  }
  
  return content;
}

/**
 * 创建错误响应
 */
function createErrorResponse(message: string): MCPResponse {
  return {
    type: 'error',
    content: message,
    success: false
  };
}

/**
 * 创建确认请求
 */
function createConfirmationRequest(content: string, confirmationMessage: string): MCPResponse {
  return {
    type: 'info',
    content,
    success: true,
    requireConfirmation: true,
    isAwaitingConfirmation: true,
    confirmationMessage
  };
}

// 启动服务器
app.listen(port, () => {
  console.log(`天气查询MCP服务器正在运行，端口: ${port}`);
}); 