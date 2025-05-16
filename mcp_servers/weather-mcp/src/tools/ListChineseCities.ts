import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { WEATHER_API_GEO_URL, WEATHER_API_KEY } from "../constants.js";
import { BaseToolImplementation } from "./BaseTool.js";

class ListChineseCitiesTool extends BaseToolImplementation {
  name = "list_chinese_cities";
  toolDefinition: Tool = {
    name: this.name,
    description: "获取支持查询天气的中国主要城市列表",
    inputSchema: {
      type: "object",
    },
  };

  toolCall = async () => {
    try {
      // 使用和风天气API获取热门城市列表
      // 由于和风天气API没有直接提供热门城市列表，我们自定义一些主要城市
      const majorCities = [
        "北京", "上海", "广州", "深圳", "重庆", 
        "成都", "杭州", "武汉", "西安", "南京", 
        "天津", "苏州", "郑州", "长沙", "东莞", 
        "青岛", "沈阳", "宁波", "昆明"
      ];
      
      // 如果API密钥已设置，则尝试获取每个城市的详细信息
      if (WEATHER_API_KEY) {
        const citiesData = [];
        
        // 逐个获取城市信息
        for (const city of majorCities) {
          try {
            const url = `${WEATHER_API_GEO_URL}?key=${WEATHER_API_KEY}&location=${encodeURIComponent(city)}&range=cn`;
            const response = await fetch(url);
            
            if (response.ok) {
              const data = await response.json();
              
              if (data.code === "200" && data.location && data.location.length > 0) {
                citiesData.push({
                  name: data.location[0].name,
                  id: data.location[0].id,
                  adm1: data.location[0].adm1,
                  adm2: data.location[0].adm2,
                  lat: data.location[0].lat,
                  lon: data.location[0].lon
                });
              }
            }
          } catch (e) {
            console.error(`获取城市 ${city} 信息时出错:`, e);
          }
        }
        
        if (citiesData.length > 0) {
          return {
            content: [{ type: "text", text: JSON.stringify(citiesData) }],
          };
        }
      } else {
        // 如果API密钥未设置，返回友好的错误信息
        return {
          content: [
            { 
              type: "error", 
              text: "请在 .env 文件中设置正确的和风天气 API 密钥，并确保您已注册和风天气开发者账号" 
            },
          ],
        };
      }
      
      // 如果API调用失败，返回基本城市列表
      const cities = majorCities.map(name => ({ name, chineseName: name }));
      
      return {
        content: [{ type: "text", text: JSON.stringify(cities) }],
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

export default ListChineseCitiesTool; 