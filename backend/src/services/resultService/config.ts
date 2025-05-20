import dotenv from 'dotenv';

dotenv.config();

export const resultConfig = {
  // AI配置
  ai: {
    baseUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434/v1',
    model: process.env.RESULT_AI_MODEL || 'gemma3:latest',
    maxTokens: parseInt(process.env.RESULT_AI_MAX_TOKENS || '2048', 10),
    temperature: parseFloat(process.env.RESULT_AI_TEMPERATURE || '0.7'),
  },

  // 分析配置
  analysis: {
    maxSuggestions: 5,
    includeOriginalOutput: true,
    defaultPrompt: `请分析以下命令执行结果和AI输出，并提供分析总结。
注意：
1. 如果发现错误，请提供具体的错误分析和解决建议
2. 如果是天气查询，请提供天气信息的总结
3. 如果是命令执行，请评估执行结果并提供相关建议
4. 请确保输出是有效的JSON格式`,
  },

  // 错误消息
  errors: {
    invalidResponse: 'Invalid response from AI API',
    jsonExtractionFailed: '无法从AI响应中提取JSON',
    incompleteFormat: 'AI响应格式不完整',
    analysisFailed: '分析过程发生错误',
  },
}; 