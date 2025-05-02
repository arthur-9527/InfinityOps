export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AICompletionOptions {
  model?: string;
  messages: AIMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface AICompletionResponse {
  id: string;
  model: string;
  created: number;
  choices: {
    message: AIMessage;
    finishReason: string;
  }[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface AIService {
  createCompletion(options: AICompletionOptions): Promise<AICompletionResponse>;
  listModels(): Promise<string[]>;
} 