import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { WEATHER_API_BASE_URL, WEATHER_API_KEY } from "../constants.js";
import { BaseToolImplementation } from "./BaseTool.js";

class BeijingWeatherTool extends BaseToolImplementation {
  name = "beijing_weather";
  toolDefinition: Tool = {
    name: this.name,
    description: "获取北京的实时天气信息",
    inputSchema: {
      type: "object",
    },
  };

  toolCall = async () => {
    try {
      // 检查API密钥是否已设置
      if (!WEATHER_API_KEY) {
        return {
          content: [
            { 
              type: "error", 
              text: "请在 .env 文件中设置正确的和风天气 API 密钥，并确保您已注册和风天气开发者账号" 
            },
          ],
        };
      }

      // 实际API调用代码 - 和风天气API
      const url = `${WEATHER_API_BASE_URL}?key=${WEATHER_API_KEY}&location=101010100`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`获取天气数据失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // 检查API返回的状态码
      if (data.code !== "200") {
        throw new Error(`和风天气API错误: ${data.code}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(data) }],
      };
    } catch (error) {
      return {
        content: [
          { type: "error", text: JSON.stringify((error as any).message) },
        ],
      };
    }
  };
}

export default BeijingWeatherTool; 