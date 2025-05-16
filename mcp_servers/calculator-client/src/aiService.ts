import * as path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import OpenAI from 'openai';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 使用绝对路径加载.env文件
dotenv.config({ path: path.resolve(__dirname, '../.env') });
console.log(`加载.env文件: ${path.resolve(__dirname, '../.env')}`);

// 定义服务类型
export type ServiceType = 'calculator' | 'weather' | 'unknown';

// 定义工具分析结果
export interface ToolAnalysisResult {
  serviceType: ServiceType;
  recommendedTool: string;
  confidence: number; // 0-100的可信度
  parameters?: Record<string, any>; // 从用户输入提取的可能参数
}

// 创建AI客户端
let openaiClient: OpenAI | null = null;
let ollamaBaseUrl: string | null = null;
let ollamaModel: string | null = null;

// 初始化AI客户端
function initAIClient() {
  if (process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_API_URL || 'https://api.openai.com/v1'
    });
    console.log('使用OpenAI API进行分析');
  } else if (process.env.OLLAMA_API_URL) {
    ollamaBaseUrl = process.env.OLLAMA_API_URL;
    ollamaModel = process.env.OLLAMA_MODEL || 'gemma3:latest';
    console.log(`使用Ollama API进行分析, 模型: ${ollamaModel}`);
  } else {
    console.warn('未配置AI服务, 将使用关键词匹配进行分析');
  }
}

initAIClient();

/**
 * 使用AI分析用户输入，确定应该使用哪个服务和工具
 */
export async function analyzeUserInput(
  userInput: string,
  availableTools: Array<{ name: string; description: string; serverName: string; parameters?: any }>
): Promise<ToolAnalysisResult> {
  try {
    if (openaiClient || ollamaBaseUrl) {
      return await aiBasedAnalysis(userInput, availableTools);
    } else {
      console.log('使用关键词匹配进行分析');
      return fallbackAnalysis(userInput);
    }
  } catch (error) {
    console.error('AI分析失败，使用关键词匹配作为备选:', error);
    return fallbackAnalysis(userInput);
  }
}

/**
 * 使用AI进行分析
 */
async function aiBasedAnalysis(
  userInput: string,
  availableTools: Array<{ name: string; description: string; serverName: string; parameters?: any }>
): Promise<ToolAnalysisResult> {
  // 准备分析提示
  const toolDescriptions = availableTools.map(tool => {
    const paramDesc = tool.parameters ? 
      `, 参数: ${JSON.stringify(tool.parameters)}` : '';
    return `- ${tool.name} (服务: ${tool.serverName}): ${tool.description}${paramDesc}`;
  }).join('\n');
  
  const prompt = `
你是一个智能助手，负责分析用户输入并确定要调用的MCP服务和工具。
可用的工具:
${toolDescriptions}

用户输入: "${userInput}"

请以JSON格式返回分析结果，包含以下字段:
- serviceType: 服务类型，可能是 "calculator"、"weather" 或 "unknown"
- recommendedTool: 推荐使用的工具名称
- confidence: 置信度 (0-100)
- parameters: 从用户输入中提取的参数

仅返回有效的JSON数据，无需其他解释。例如:
{
  "serviceType": "calculator",
  "recommendedTool": "add",
  "confidence": 90,
  "parameters": {
    "a": 5,
    "b": 3
  }
}
`;

  let response;
  if (openaiClient) {
    // 使用OpenAI API
    response = await openaiClient.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
    });
    
    try {
      const content = response.choices[0].message.content;
      if (content) {
        return JSON.parse(content);
      }
    } catch (error) {
      console.error('解析OpenAI响应失败:', error);
      throw error;
    }
  } else if (ollamaBaseUrl) {
    // 使用Ollama API
    try {
      const response = await fetch(`${ollamaBaseUrl}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: ollamaModel,
          prompt: prompt,
          stream: false,
        })
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API 错误: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      if (data.response) {
        // 尝试提取JSON响应
        const jsonMatch = data.response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
      }
      throw new Error('无法从Ollama响应中提取有效的JSON');
    } catch (error) {
      console.error('Ollama API调用失败:', error);
      throw error;
    }
  }
  
  // 如果没有有效响应，使用关键词匹配
  throw new Error('AI服务未返回有效响应');
}

/**
 * 使用关键词匹配进行分析 (作为备选方案)
 */
export function fallbackAnalysis(userInput: string): ToolAnalysisResult {
  const input = userInput.toLowerCase();
  
  // 计算器相关关键词
  if (input.match(/计算|算术|加|减|乘|除|加法|减法|乘法|除法|\+|\-|\*|\/|等于|求|结果/)) {
    // 提取数字
    const params = extractNumbers(input);
    
    // 识别具体的计算操作
    if (input.match(/加|加法|\+/)) {
      return {
        serviceType: 'calculator',
        recommendedTool: 'add',
        confidence: 80,
        parameters: params,
      };
    } else if (input.match(/减|减法|\-/)) {
      return {
        serviceType: 'calculator',
        recommendedTool: 'subtract',
        confidence: 80,
        parameters: params,
      };
    } else if (input.match(/乘|乘法|\*|×|x|X/)) {
      return {
        serviceType: 'calculator',
        recommendedTool: 'multiply',
        confidence: 80,
        parameters: params,
      };
    } else if (input.match(/除|除法|\/|÷/)) {
      return {
        serviceType: 'calculator',
        recommendedTool: 'divide',
        confidence: 80,
        parameters: params,
      };
    } else {
      // 默认使用加法
      return {
        serviceType: 'calculator',
        recommendedTool: 'add',
        confidence: 60,
        parameters: params,
      };
    }
  } 
  // 天气相关关键词
  else if (input.match(/天气|温度|气温|湿度|气候|今天|明天|预报|多少度|城市|北京|上海|广州|查询/)) {
    // 检查是否是北京天气
    if (input.includes('北京')) {
      return {
        serviceType: 'weather',
        recommendedTool: 'beijing_weather',
        confidence: 90,
      };
    } 
    // 检查是否包含城市名称
    else {
      const cityMatches = input.match(/北京|上海|广州|深圳|杭州|南京|成都|武汉|天津|重庆|西安|苏州|青岛|沈阳|大连|哈尔滨|长春|石家庄|郑州|济南|合肥|长沙|南昌|福州|厦门|昆明|贵阳|海口|拉萨|银川|西宁|兰州|太原|呼和浩特|乌鲁木齐/);
      const city = cityMatches ? cityMatches[0] : '';
      
      if (city) {
        return {
          serviceType: 'weather',
          recommendedTool: 'city_weather',
          confidence: 85,
          parameters: { city: city, type: 'now' },
        };
      } else {
        // 尝试从句子中提取可能的城市
        const possibleCity = extractPossibleCity(input);
        if (possibleCity) {
          return {
            serviceType: 'weather',
            recommendedTool: 'city_weather',
            confidence: 75,
            parameters: { city: possibleCity, type: 'now' },
          };
        } else {
          return {
            serviceType: 'weather',
            recommendedTool: 'city_weather',
            confidence: 70,
            parameters: {},
          };
        }
      }
    }
  } 
  // 城市列表查询
  else if (input.match(/城市列表|支持|哪些城市|列表|所有城市|城市有哪些/)) {
    return {
      serviceType: 'weather',
      recommendedTool: 'list_chinese_cities',
      confidence: 80,
    };
  }

  // 无法确定
  return {
    serviceType: 'unknown',
    recommendedTool: '',
    confidence: 0,
    parameters: {},
  };
}

/**
 * 从文本中提取可能的城市名称
 */
function extractPossibleCity(text: string): string | null {
  // 尝试从"XX的天气"、"XX天气怎么样"等模式中提取城市
  const cityPatterns = [
    /(.{1,4})的天气/,
    /(.{1,4})天气怎么样/,
    /(.{1,4})的气温/,
    /(.{1,4})今天天气/,
    /查询(.{1,4})天气/,
    /(.{1,4})明天天气/,
  ];
  
  for (const pattern of cityPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      // 排除一些非城市词
      const nonCities = ['今天', '明天', '查询', '现在', '当前', '最近', '未来', '预报'];
      if (!nonCities.includes(match[1])) {
        return match[1];
      }
    }
  }
  
  return null;
}

/**
 * 从文本中提取数字
 */
function extractNumbers(text: string): { a?: number; b?: number } {
  const numbers = text.match(/\d+(\.\d+)?/g);
  
  if (!numbers) {
    return {};
  }
  
  if (numbers.length >= 2) {
    return {
      a: parseFloat(numbers[0]),
      b: parseFloat(numbers[1]),
    };
  } else if (numbers.length === 1) {
    return {
      a: parseFloat(numbers[0]),
    };
  }
  
  return {};
} 