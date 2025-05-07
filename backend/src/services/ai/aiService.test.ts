import { createOllamaService } from './aiService';
import '@types/jest';

describe('AIService', () => {
  it('should call Ollama service successfully', async () => {
    const ollamaService = createOllamaService();
    const response = await ollamaService.callAI({
      prompt: 'Hello, how are you?',
    });
    expect(response.text).toBeDefined();
  });
}); 