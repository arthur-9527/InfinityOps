import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { 
  WEATHER_API_BASE_URL, 
  WEATHER_API_KEY, 
  WEATHER_API_GEO_URL, 
  WEATHER_API_FORECAST_URL,
  WEATHER_API_HOURLY_URL
} from "../constants.js";
import { z } from "zod";
import { CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { BaseToolImplementation } from "./BaseTool.js";

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

class CityWeatherTool extends BaseToolImplementation {
  name = "city_weather";
  toolDefinition: Tool = {
    name: this.name,
    description: "获取指定中国城市的天气信息，包括实时天气、未来7天预报和24小时预报",
    inputSchema: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "城市名称，例如：shanghai、guangzhou、chengdu等",
        },
        type: {
          type: "string",
          description: "查询类型, 可选: now (实时天气), forecast (7天预报), hourly (24小时预报), all (所有信息)",
        }
      },
      required: ["city"],
    },
  };

  async toolCall(request: z.infer<typeof CallToolRequestSchema>) {
    try {
      console.log("开始处理城市天气查询请求");
      
      const cityName = request.params.arguments?.city as string;
      if (!cityName) {
        throw new Error("缺少城市名称参数");
      }
      
      console.log(`正在查询城市: ${cityName}`);

      // 检查API密钥是否已设置
      if (!WEATHER_API_KEY) {
        console.error("API密钥未设置");
        return {
          content: [
            { 
              type: "error", 
              text: "请在 .env 文件中设置正确的和风天气 API 密钥，并确保您已注册和风天气开发者账号" 
            },
          ],
        };
      }

      // 设置查询类型，默认为实时天气
      const queryType = (request.params.arguments?.type as string) || 'now';
      
      // 确保输入的查询类型有效
      if (!['now', 'forecast', 'hourly', 'all'].includes(queryType)) {
        console.error(`查询类型无效: ${queryType}`);
        throw new Error("查询类型无效，请使用: now, forecast, hourly 或 all");
      }
      
      console.log(`查询类型: ${queryType}`);

      // 先尝试从城市映射中获取ID
      let locationId = '';
      const normalizedCityName = cityName.toLowerCase().trim();
      
      if (CITY_ID_MAP[normalizedCityName]) {
        locationId = CITY_ID_MAP[normalizedCityName];
        console.log(`从映射中获取城市ID: ${locationId}`);
      } else {
        console.log(`尝试通过API获取城市 ${cityName} 的ID`);
        try {
          // 和风天气API需要先通过城市名查询location ID
          const geoUrl = `${WEATHER_API_GEO_URL}?key=${WEATHER_API_KEY}&location=${encodeURIComponent(cityName)}&range=cn`;
          console.log(`发送地理位置查询请求: ${geoUrl}`);
          
          // 添加超时控制
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
          
          const geoResponse = await fetch(geoUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!geoResponse.ok) {
            console.error(`地理位置查询失败: ${geoResponse.status} ${geoResponse.statusText}`);
            throw new Error(`查询城市信息失败: ${geoResponse.status} ${geoResponse.statusText}`);
          }

          const geoData = await geoResponse.json();
          console.log(`收到地理位置查询响应: ${JSON.stringify(geoData)}`);
          
          // 检查地理API返回的状态码
          if (geoData.code !== "200") {
            console.error(`地理API返回错误: ${geoData.code}`);
            throw new Error(`和风天气地理API错误: ${geoData.code}`);
          }

          // 检查是否找到城市
          if (!geoData.location || geoData.location.length === 0) {
            console.error(`找不到城市: ${cityName}`);
            throw new Error(`找不到城市: ${cityName}`);
          }

          // 获取第一个匹配的城市ID
          locationId = geoData.location[0].id;
          console.log(`获取到城市ID: ${locationId}`);
        } catch (err: any) {
          if (err.name === 'AbortError') {
            console.error('地理位置查询请求超时');
            throw new Error('和风天气地理API请求超时，请稍后重试');
          }
          throw err;
        }
      }

      if (!locationId) {
        console.error(`无法获取城市 ${cityName} 的位置ID`);
        throw new Error(`无法获取城市 ${cityName} 的位置ID`);
      }

      // 最终结果对象
      const resultData: any = {
        city: {
          name: cityName,
          id: locationId
        }
      };

      console.log(`开始获取天气数据，类型: ${queryType}`);

      // 根据查询类型获取不同的天气数据
      if (queryType === 'now' || queryType === 'all') {
        try {
          console.log('获取实时天气数据');
          // 获取实时天气数据
          const weatherUrl = `${WEATHER_API_BASE_URL}?key=${WEATHER_API_KEY}&location=${locationId}`;
          console.log(`发送实时天气请求: ${weatherUrl}`);
          
          // 添加超时控制
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒超时
          
          const weatherResponse = await fetch(weatherUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          
          if (!weatherResponse.ok) {
            console.error(`实时天气请求失败: ${weatherResponse.status} ${weatherResponse.statusText}`);
            throw new Error(`获取实时天气数据失败: ${weatherResponse.status} ${weatherResponse.statusText}`);
          }

          const weatherData = await weatherResponse.json();
          console.log(`收到实时天气响应: ${JSON.stringify(weatherData).substring(0, 100)}...`);
          
          if (weatherData.code !== "200") {
            console.error(`天气API返回错误: ${weatherData.code}`);
            throw new Error(`和风天气API错误: ${weatherData.code}`);
          }

          resultData.now = weatherData.now;
          console.log('实时天气数据获取成功');
        } catch (err: any) {
          if (err.name === 'AbortError') {
            console.error('实时天气请求超时');
            resultData.error = '获取实时天气数据超时，请稍后重试';
          } else {
            console.error(`获取实时天气数据错误: ${err.message}`);
            resultData.error = `获取实时天气数据失败: ${err.message}`;
          }
        }
      }

      if (queryType === 'forecast' || queryType === 'all') {
        // 获取7天预报数据
        const forecastUrl = `${WEATHER_API_FORECAST_URL}?key=${WEATHER_API_KEY}&location=${locationId}`;
        const forecastResponse = await fetch(forecastUrl);
        
        if (!forecastResponse.ok) {
          throw new Error(`获取天气预报数据失败: ${forecastResponse.status} ${forecastResponse.statusText}`);
        }

        const forecastData = await forecastResponse.json();
        
        if (forecastData.code !== "200") {
          throw new Error(`和风天气API错误: ${forecastData.code}`);
        }

        resultData.forecast = forecastData.daily;
      }

      if (queryType === 'hourly' || queryType === 'all') {
        // 获取24小时预报数据
        const hourlyUrl = `${WEATHER_API_HOURLY_URL}?key=${WEATHER_API_KEY}&location=${locationId}`;
        const hourlyResponse = await fetch(hourlyUrl);
        
        if (!hourlyResponse.ok) {
          throw new Error(`获取小时预报数据失败: ${hourlyResponse.status} ${hourlyResponse.statusText}`);
        }

        const hourlyData = await hourlyResponse.json();
        
        if (hourlyData.code !== "200") {
          throw new Error(`和风天气API错误: ${hourlyData.code}`);
        }

        resultData.hourly = hourlyData.hourly;
      }

      // 返回已获取的数据，即使某些请求失败
      console.log(`返回结果: ${JSON.stringify(resultData).substring(0, 100)}...`);
      return {
        content: [{ type: "text", text: JSON.stringify(resultData) }],
      };
    } catch (err: any) {
      console.error(`工具执行错误: ${err.message}`, err);
      return {
        content: [
          { type: "error", text: err.message || "未知错误" },
        ],
      };
    }
  }
}

export default CityWeatherTool; 