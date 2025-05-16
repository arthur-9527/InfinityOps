import dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 使用绝对路径加载.env文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });
console.error(`Loading .env from: ${path.resolve(__dirname, '../.env')}`);

export const WEATHER_API_BASE_URL = "https://devapi.qweather.com/v7/weather/now";
export const WEATHER_API_KEY = process.env.WEATHER_API_KEY || ""; // 从环境变量中获取API密钥
export const WEATHER_API_GEO_URL = "https://geoapi.qweather.com/v2/city/lookup";
export const WEATHER_API_FORECAST_URL = "https://devapi.qweather.com/v7/weather/7d";
export const WEATHER_API_HOURLY_URL = "https://devapi.qweather.com/v7/weather/24h";

export const CONSTANTS = {
  PROJECT_NAME: "weather-mcp",
  PROJECT_VERSION: "0.1.0" as `${number}.${number}.${number}`, // 添加类型断言
  DEFAULT_CITY: "beijing", // 默认城市
}; 