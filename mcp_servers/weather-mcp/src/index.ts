#!/usr/bin/env node
import { FastMCP } from "fastmcp";
import { z } from "zod";
import { 
  WEATHER_API_BASE_URL, 
  WEATHER_API_KEY, 
  WEATHER_API_GEO_URL, 
  WEATHER_API_FORECAST_URL,
  WEATHER_API_HOURLY_URL,
  CONSTANTS
} from "./constants.js";

// 定义参数类型接口
interface CityWeatherParams {
  city: string;
  type: "now" | "forecast" | "hourly" | "all";
}

// 映射常用城市代码，减少API调用次数
const CITY_ID_MAP: Record<string, string> = {
  'beijing': '101010100',
  'shanghai': '101020100',
  'guangzhou': '101280101',
  'shenzhen': '101280601',
  'hangzhou': '101210101',
  'nanjing': '101190101',
  'chengdu': '101270101',
  'wuhan': '101200101',
  'tianjin': '101030100',
  'chongqing': '101040100',
  'xian': '101110101',
  'suzhou': '101190401',
  'qingdao': '101120201'
};

// 创建 FastMCP 服务器实例
const server = new FastMCP({
  name: CONSTANTS.PROJECT_NAME,
  version: CONSTANTS.PROJECT_VERSION,
  instructions: "获取中国城市的天气信息"
});

// 添加北京天气工具
server.addTool({
  name: "beijing_weather",
  description: "获取北京市的实时天气信息",
  parameters: z.object({}),
  execute: async () => {
    try {
      // 检查API密钥是否已设置
      if (!WEATHER_API_KEY) {
        return `错误: 请在 .env 文件中设置正确的和风天气 API 密钥`;
      }

      const locationId = CITY_ID_MAP['beijing'];
      const weatherUrl = `${WEATHER_API_BASE_URL}?key=${WEATHER_API_KEY}&location=${locationId}`;
      
      const response = await fetch(weatherUrl);
      if (!response.ok) {
        return `获取天气数据失败: ${response.status} ${response.statusText}`;
      }

      const data = await response.json();
      if (data.code !== "200") {
        return `和风天气API错误: ${data.code}`;
      }

      const weather = data.now;
      return `北京市实时天气信息:
- 温度: ${weather.temp}°C
- 体感温度: ${weather.feelsLike}°C
- 天气: ${weather.text}
- 风向: ${weather.windDir}
- 风力等级: ${weather.windScale}级
- 风速: ${weather.windSpeed}km/h
- 相对湿度: ${weather.humidity}%
- 降水量: ${weather.precip}mm
- 气压: ${weather.pressure}hPa
- 能见度: ${weather.vis}km
- 云量: ${weather.cloud}%
- 更新时间: ${data.updateTime}`;
    } catch (error) {
      console.error("获取北京天气数据错误:", error);
      return `获取北京天气数据时出错: ${error}`;
    }
  }
});

// 添加城市天气工具
server.addTool({
  name: "city_weather",
  description: "获取指定中国城市的天气信息，包括实时天气、未来7天预报和24小时预报",
  parameters: z.object({
    city: z.string().describe("城市名称，例如：shanghai、guangzhou、chengdu等"),
    type: z.enum(["now", "forecast", "hourly", "all"])
      .default("now")
      .describe("查询类型: now (实时天气), forecast (7天预报), hourly (24小时预报), all (所有信息)"),
  }),
  execute: async (args: CityWeatherParams) => {
    try {
      console.log(`开始处理城市天气查询请求: ${args.city}, 类型: ${args.type}`);
      
      // 检查API密钥是否已设置
      if (!WEATHER_API_KEY) {
        return `错误: 请在 .env 文件中设置正确的和风天气 API 密钥`;
      }

      // 先尝试从城市映射中获取ID
      let locationId = '';
      const normalizedCityName = args.city.toLowerCase().trim();
      
      if (CITY_ID_MAP[normalizedCityName]) {
        locationId = CITY_ID_MAP[normalizedCityName];
      } else {
        try {
          // 和风天气API需要先通过城市名查询location ID
          const geoUrl = `${WEATHER_API_GEO_URL}?key=${WEATHER_API_KEY}&location=${encodeURIComponent(args.city)}&range=cn`;
          
          const geoResponse = await fetch(geoUrl);
          if (!geoResponse.ok) {
            return `查询城市信息失败: ${geoResponse.status} ${geoResponse.statusText}`;
          }

          const geoData = await geoResponse.json();
          
          // 检查地理API返回的状态码
          if (geoData.code !== "200") {
            return `和风天气地理API错误: ${geoData.code}`;
          }

          // 检查是否找到城市
          if (!geoData.location || geoData.location.length === 0) {
            return `找不到城市: ${args.city}`;
          }

          // 获取第一个匹配的城市ID
          locationId = geoData.location[0].id;
        } catch (err: any) {
          return `获取城市位置ID时出错: ${err.message}`;
        }
      }

      if (!locationId) {
        return `无法获取城市 ${args.city} 的位置ID`;
      }

      let resultText = `${args.city.toUpperCase()} 的天气信息:\n\n`;

      // 根据查询类型获取不同的天气数据
      if (args.type === 'now' || args.type === 'all') {
        try {
          // 获取实时天气数据
          const weatherUrl = `${WEATHER_API_BASE_URL}?key=${WEATHER_API_KEY}&location=${locationId}`;
          
          const weatherResponse = await fetch(weatherUrl);
          if (!weatherResponse.ok) {
            return `获取实时天气数据失败: ${weatherResponse.status} ${weatherResponse.statusText}`;
          }

          const weatherData = await weatherResponse.json();
          
          if (weatherData.code !== "200") {
            return `和风天气API错误: ${weatherData.code}`;
          }

          const weather = weatherData.now;
          resultText += `实时天气:
- 温度: ${weather.temp}°C
- 体感温度: ${weather.feelsLike}°C
- 天气: ${weather.text}
- 风向: ${weather.windDir}
- 风力等级: ${weather.windScale}级
- 风速: ${weather.windSpeed}km/h
- 相对湿度: ${weather.humidity}%
- 降水量: ${weather.precip}mm
- 气压: ${weather.pressure}hPa
- 能见度: ${weather.vis}km
- 更新时间: ${weatherData.updateTime}\n\n`;
        } catch (err: any) {
          resultText += `获取实时天气数据失败: ${err.message}\n\n`;
        }
      }

      if (args.type === 'forecast' || args.type === 'all') {
        try {
          // 获取7天预报数据
          const forecastUrl = `${WEATHER_API_FORECAST_URL}?key=${WEATHER_API_KEY}&location=${locationId}`;
          const forecastResponse = await fetch(forecastUrl);
          
          if (!forecastResponse.ok) {
            resultText += `获取天气预报数据失败: ${forecastResponse.status} ${forecastResponse.statusText}\n\n`;
          } else {
            const forecastData = await forecastResponse.json();
            
            if (forecastData.code !== "200") {
              resultText += `和风天气预报API错误: ${forecastData.code}\n\n`;
            } else {
              resultText += "7天天气预报:\n";
              
              // 最多显示3天预报，避免返回信息过长
              const maxDays = Math.min(forecastData.daily.length, 3);
              
              for (let i = 0; i < maxDays; i++) {
                const day = forecastData.daily[i];
                resultText += `- ${day.fxDate}: ${day.textDay}，温度 ${day.tempMin}~${day.tempMax}°C\n`;
              }
              
              resultText += "\n";
            }
          }
        } catch (err: any) {
          resultText += `获取天气预报数据失败: ${err.message}\n\n`;
        }
      }

      if (args.type === 'hourly' || args.type === 'all') {
        try {
          // 获取24小时预报数据
          const hourlyUrl = `${WEATHER_API_HOURLY_URL}?key=${WEATHER_API_KEY}&location=${locationId}`;
          const hourlyResponse = await fetch(hourlyUrl);
          
          if (!hourlyResponse.ok) {
            resultText += `获取小时预报数据失败: ${hourlyResponse.status} ${hourlyResponse.statusText}`;
          } else {
            const hourlyData = await hourlyResponse.json();
            
            if (hourlyData.code !== "200") {
              resultText += `和风天气小时API错误: ${hourlyData.code}`;
            } else {
              resultText += "未来6小时天气:\n";
              
              // 最多显示6小时预报，避免返回信息过长
              const maxHours = Math.min(hourlyData.hourly.length, 6);
              
              for (let i = 0; i < maxHours; i++) {
                const hour = hourlyData.hourly[i];
                const time = hour.fxTime.split("T")[1].substring(0, 5);
                resultText += `- ${time}: ${hour.text}，温度 ${hour.temp}°C，湿度 ${hour.humidity}%\n`;
              }
            }
          }
        } catch (err: any) {
          resultText += `获取小时预报数据失败: ${err.message}`;
        }
      }

      return resultText;
    } catch (error) {
      console.error("处理城市天气查询请求错误:", error);
      return `处理请求时出错: ${error}`;
    }
  }
});

// 添加中国城市列表工具
server.addTool({
  name: "list_chinese_cities",
  description: "列出支持的中国主要城市",
  parameters: z.object({}),
  execute: async () => {
    const cityNames = Object.keys(CITY_ID_MAP).map(name => 
      name.charAt(0).toUpperCase() + name.slice(1)
    ).join(", ");
    
    return `支持的中国主要城市: ${cityNames}

这些城市已经预先配置ID，可以直接使用。其他中国城市也可以查询，但需要额外的API调用来获取城市ID。`;
  }
});

// 启动服务器
server.start({
  transportType: "stdio",
});

console.error("Weather MCP 服务器已启动"); 