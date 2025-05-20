/**
 * AI服务模块入口文件
 * 导出AI服务相关类、接口和工厂函数
 */

// 导出AI服务基础类和接口
export { 
  AIService, 
  type AIConfig, 
  type AIProvider,
  type AIRequestParams, 
  type AIResponse
} from './aiService';

// 导出AI服务工厂类
export { 
  AIFactory, 
  defaultAIService, 
  terminalAIService 
} from './aiFactory';

// Note: test-ai.ts 是测试脚本，不作为模块导出 