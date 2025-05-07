import OpenAI from 'openai';
import { createModuleLogger } from '../../utils/logger';
import axios from 'axios';

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
      apiKey: config.apiKey || 'dummy-api-key', // Ollama不需要真实的API key
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

      // 根据不同的AI提供商构建不同的请求
      let response;
      
      // Ollama使用不同的API格式
      if (this.config.provider === 'ollama') {
        // 构建Ollama请求参数
        const ollamaRequestBody: any = {
          model: this.config.model,
          prompt: prompt,
          temperature,
          stream: false
        };
        
        // 添加系统提示（如果有）
        if (systemPrompt) {
          ollamaRequestBody.system = systemPrompt;
        }
        
        // 添加最大Token参数（如果有）
        if (maxTokens || this.config.maxTokens) {
          ollamaRequestBody.num_predict = maxTokens || this.config.maxTokens;
        }
        
        // 调用Ollama生成API
        const url = `${this.config.baseURL}/api/generate`;
        logger.info(`Calling Ollama API at: ${url}`);
        
        const axiosResponse = await axios.post(url, ollamaRequestBody, {
          headers: {
            'Content-Type': 'application/json',
          },
        });
        
        const ollamaResponse = axiosResponse.data;
        return {
          text: ollamaResponse.response || '',
          usage: {
            promptTokens: ollamaResponse.prompt_eval_count || 0,
            completionTokens: ollamaResponse.eval_count || 0,
            totalTokens: (ollamaResponse.prompt_eval_count || 0) + (ollamaResponse.eval_count || 0),
          },
        };
      } else {
        // OpenAI和兼容API使用聊天补全API
        let messages: OpenAI.ChatCompletionMessageParam[] = [];
        
        // 添加系统提示（如果有）
        if (systemPrompt) {
          messages.push({ role: 'system', content: systemPrompt });
        }
        
        // 添加用户提示
        messages.push({ role: 'user', content: prompt });

        response = await this.client.chat.completions.create({
          model: this.config.model,
          messages: messages,
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
      }
    } catch (error: any) {
      logger.error(`Error calling AI service (${this.config.provider}/${this.config.model}):`, error);
      throw error;
    }
  }
} 