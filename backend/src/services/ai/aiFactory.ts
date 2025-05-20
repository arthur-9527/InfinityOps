import { AIService, AIConfig, AIProvider } from './aiService';
import { createModuleLogger } from '../../utils/logger';

const logger = createModuleLogger('AI Factory');

/**
 * AI服务工厂类，用于创建不同的AI服务实例
 */
export class AIFactory {
  /**
   * 创建Ollama服务实例
   */
  static createOllamaService(model?: string): AIService {
    const ollamaModel = model || process.env.OLLAMA_DEFAULT_MODEL || 'gemma3:latest';
    const ollamaUrl = process.env.OLLAMA_API_URL || 'http://localhost:11434';
    
    logger.info(`Creating Ollama service with model: ${ollamaModel}`);
    
    const config: AIConfig = {
      provider: 'ollama',
      model: ollamaModel,
      baseURL: ollamaUrl,
      maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '2048', 10),
    };
    
    return new AIService(config);
  }

  /**
   * 创建OpenAI服务实例
   */
  static createOpenAIService(model?: string): AIService {
    const openAIModel = model || process.env.OPENAI_DEFAULT_MODEL || 'gpt-3.5-turbo';
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      logger.warn('OpenAI API key not set, defaulting to Ollama');
      return this.createOllamaService();
    }
    
    logger.info(`Creating OpenAI service with model: ${openAIModel}`);
    
    const config: AIConfig = {
      provider: 'openai',
      model: openAIModel,
      apiKey,
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS || '2048', 10),
    };
    
    return new AIService(config);
  }

  /**
   * 创建Anthropic服务实例
   */
  static createAnthropicService(model?: string): AIService {
    const anthropicModel = model || process.env.ANTHROPIC_DEFAULT_MODEL || 'claude-3-haiku-20240307';
    const apiKey = process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      logger.warn('Anthropic API key not set, defaulting to Ollama');
      return this.createOllamaService();
    }
    
    logger.info(`Creating Anthropic service with model: ${anthropicModel}`);
    
    const config: AIConfig = {
      provider: 'anthropic',
      model: anthropicModel,
      apiKey,
      baseURL: 'https://api.anthropic.com',
      maxTokens: parseInt(process.env.ANTHROPIC_MAX_TOKENS || '2048', 10),
    };
    
    return new AIService(config);
  }

  /**
   * 根据提供商创建AI服务实例
   */
  static createService(provider: AIProvider, model?: string): AIService {
    switch (provider) {
      case 'openai':
        return this.createOpenAIService(model);
      case 'anthropic':
        return this.createAnthropicService(model);
      case 'ollama':
      default:
        return this.createOllamaService(model);
    }
  }

  /**
   * 根据环境变量创建默认AI服务
   */
  static createDefaultService(): AIService {
    const provider = (process.env.DEFAULT_AI_PROVIDER || 'ollama') as AIProvider;
    const model = process.env.DEFAULT_AI_MODEL;
    
    logger.info(`Creating default AI service with provider: ${provider}`);
    return this.createService(provider, model);
  }

  /**
   * 根据终端AI中间件配置创建服务
   */
  static createTerminalAIService(): AIService {
    const provider = (process.env.TERMINAL_AI_PROVIDER || 'ollama') as AIProvider;
    const model = process.env.TERMINAL_AI_MODEL;
    
    logger.info(`Creating terminal AI service with provider: ${provider}`);
    return this.createService(provider, model);
  }
}

// 导出默认AI服务实例
export const defaultAIService = AIFactory.createDefaultService();

// 导出终端AI服务实例
export const terminalAIService = AIFactory.createTerminalAIService(); 