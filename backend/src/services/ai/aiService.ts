import OpenAI from 'openai';
import { createModuleLogger } from '../../utils/logger';

const logger = createModuleLogger('AI Service');

// 定义AI服务提供商类型
export type AIProvider = 'openai' | 'ollama' | 'anthropic';

// 定义AI服务配置接口
export interface AIConfig {
  provider: AIProvider;
  model: string;
  apiKey?: string;
  baseURL?: string;
  maxTokens?: number;
}

// 定义AI请求参数接口
export interface AIRequestParams {
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

// 定义AI响应接口
export interface AIResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * 通用AI服务类，基于OpenAI客户端
 * 支持多种AI服务提供商，包括OpenAI、本地Ollama等
 */
export class AIService {
  private client: OpenAI;
  private config: AIConfig;

  constructor(config: AIConfig) {
    this.config = config;
    
    const clientOptions: any = {
      apiKey: config.apiKey || 'ollama', // Ollama 兼容API不校验key
    };
    
    // 设置baseURL
    if (config.baseURL) {
      clientOptions.baseURL = config.baseURL;
    }
    
    this.client = new OpenAI(clientOptions);
    logger.info(`AI Service initialized with provider: ${config.provider}, model: ${config.model}`);
  }

  /**
   * 获取当前配置
   */
  getConfig(): AIConfig {
    return { ...this.config };
  }

  /**
   * 调用AI服务生成文本
   */
  async callAI(params: AIRequestParams): Promise<AIResponse> {
    try {
      const { prompt, systemPrompt, temperature = 0.7, maxTokens, stop } = params;

      let messages: OpenAI.ChatCompletionMessageParam[] = [];
      if (systemPrompt) {
        messages.push({ role: 'system', content: systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const response = await this.client.chat.completions.create({
        model: this.config.model,
        messages,
        temperature,
        max_tokens: maxTokens || this.config.maxTokens,
        stop,
      });
      
      return {
        text: response.choices[0].message.content || '',
        usage: {
          promptTokens: response.usage?.prompt_tokens || 0,
          completionTokens: response.usage?.completion_tokens || 0,
          totalTokens: response.usage?.total_tokens || 0,
        },
      };
    } catch (error: any) {
      logger.error(`Error calling AI service (${this.config.provider}/${this.config.model}):`, error);
      throw error;
    }
  }
} 