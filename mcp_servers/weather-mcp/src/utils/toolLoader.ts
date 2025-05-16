import BeijingWeatherTool from "../tools/BeijingWeather.js";
import CityWeatherTool from "../tools/CityWeather.js";
import ListChineseCitiesTool from "../tools/ListChineseCities.js";
import { BaseToolImplementation } from "../tools/BaseTool.js";

export async function loadTools(): Promise<BaseToolImplementation[]> {
  return [
    new BeijingWeatherTool(),
    new CityWeatherTool(),
    new ListChineseCitiesTool()
  ];
}

export function createToolsMap(tools: BaseToolImplementation[]): Map<string, BaseToolImplementation> {
  const toolsMap = new Map<string, BaseToolImplementation>();
  
  for (const tool of tools) {
    toolsMap.set(tool.name, tool);
  }
  
  return toolsMap;
} 