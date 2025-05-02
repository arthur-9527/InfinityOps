import { config } from '../../config';
import { AIService } from './ai.interface';
import { OllamaService } from './ollama.service';

export class AIServiceFactory {
  static createService(): AIService {
    const { ai } = config;
    
    switch (ai.provider.toLowerCase()) {
      case 'ollama':
        return new OllamaService();
      // Add other providers here
      default:
        throw new Error(`Unsupported AI provider: ${ai.provider}`);
    }
  }
} 