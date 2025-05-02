import axios, { AxiosError } from 'axios';
import { config } from '../../config';
import { AIService, AIMessage, AICompletionOptions, AICompletionResponse } from './ai.interface';

export class OllamaService implements AIService {
  private baseUrl: string;
  private defaultModel: string;
  private defaultSettings: {
    temperature: number;
    topP: number;
    topK: number;
    numPredict: number;
  };

  constructor() {
    const { ai } = config;
    this.baseUrl = ai.ollama.baseUrl;
    this.defaultModel = ai.ollama.model;
    this.defaultSettings = {
      temperature: ai.ollama.temperature,
      topP: ai.ollama.topP,
      topK: ai.ollama.topK,
      numPredict: ai.ollama.numPredict,
    };
  }

  private convertToOllamaPrompt(messages: AIMessage[]): string {
    return messages.map(msg => {
      switch (msg.role) {
        case 'system':
          return `System: ${msg.content}`;
        case 'user':
          return `User: ${msg.content}`;
        case 'assistant':
          return `Assistant: ${msg.content}`;
        default:
          return msg.content;
      }
    }).join('\n');
  }

  async createCompletion(options: AICompletionOptions): Promise<AICompletionResponse> {
    try {
      const prompt = this.convertToOllamaPrompt(options.messages);
      const requestData = {
        model: options.model || this.defaultModel,
        prompt,
        stream: options.stream || false,
        options: {
          temperature: options.temperature || this.defaultSettings.temperature,
          top_p: options.topP || this.defaultSettings.topP,
          top_k: this.defaultSettings.topK,
          num_predict: options.maxTokens || this.defaultSettings.numPredict,
        },
      };

      const response = await axios.post(`${this.baseUrl}/api/generate`, requestData);
      
      // Convert Ollama response to OpenAI-like format
      return {
        id: `ollama-${Date.now()}`,
        model: response.data.model,
        created: Math.floor(Date.now() / 1000),
        choices: [{
          message: {
            role: 'assistant',
            content: response.data.response,
          },
          finishReason: response.data.done ? 'stop' : 'length',
        }],
        usage: {
          promptTokens: 0, // Ollama doesn't provide token counts
          completionTokens: 0,
          totalTokens: 0,
        },
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('Error calling Ollama API:', axiosError.message);
      throw new Error(`Failed to generate response: ${axiosError.message}`);
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.baseUrl}/api/tags`);
      return response.data.models.map((model: any) => model.name);
    } catch (error) {
      const axiosError = error as AxiosError;
      console.error('Error fetching models:', axiosError.message);
      throw new Error(`Failed to fetch models: ${axiosError.message}`);
    }
  }
} 