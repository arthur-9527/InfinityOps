import { AIServiceFactory } from '../modules/ai/ai.factory';
import { OllamaService } from '../modules/ai/ollama.service';
import { AICompletionOptions, AIService } from '../modules/ai/ai.interface';
import { config } from '../config';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('ai-test');

/**
 * 测试AI服务工厂创建服务
 */
async function testAIServiceFactory() {
  logger.info('测试 AIServiceFactory.createService()');
  try {
    const aiService = AIServiceFactory.createService();
    logger.info(`成功创建AI服务: ${aiService.constructor.name}`);
    return aiService;
  } catch (error) {
    logger.error(`AIServiceFactory测试失败: ${error}`);
    throw error;
  }
}

/**
 * 测试获取可用模型列表
 */
async function testListModels(aiService: AIService) {
  logger.info('测试 aiService.listModels()');
  try {
    const models = await aiService.listModels();
    logger.info(`成功获取模型列表: ${models.length} 个模型可用`);
    logger.info(`可用模型: ${models.join(', ')}`);
    return models;
  } catch (error) {
    logger.error(`获取模型列表失败: ${error}`);
    throw error;
  }
}

/**
 * 测试文本补全功能
 */
async function testCompletion(aiService: AIService) {
  logger.info('测试 aiService.createCompletion()');
  
  const completionOptions: AICompletionOptions = {
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'What is the capital of France?' }
    ],
    temperature: 0.7,
    maxTokens: 100
  };

  try {
    logger.info(`发送请求到AI服务，使用模型: ${config.ai.ollama.model}`);
    const response = await aiService.createCompletion(completionOptions);
    
    logger.info('成功收到AI响应');
    logger.info(`模型: ${response.model}`);
    logger.info(`响应内容: ${response.choices[0].message.content}`);
    
    return response;
  } catch (error) {
    logger.error(`创建补全请求失败: ${error}`);
    throw error;
  }
}

/**
 * 直接测试OllamaService实例
 */
async function testOllamaServiceDirectly() {
  logger.info('直接测试 OllamaService');
  
  try {
    const ollamaService = new OllamaService();
    logger.info('成功创建OllamaService实例');
    
    const models = await ollamaService.listModels();
    logger.info(`Ollama模型: ${models.join(', ')}`);
    
    return ollamaService;
  } catch (error) {
    logger.error(`OllamaService直接测试失败: ${error}`);
    throw error;
  }
}

/**
 * 运行所有测试
 */
async function runTests() {
  logger.info('开始AI模块测试');
  
  try {
    // 测试AI服务工厂
    const aiService = await testAIServiceFactory();
    
    // 测试获取模型列表
    await testListModels(aiService);
    
    // 测试文本补全
    await testCompletion(aiService);
    
    // 直接测试OllamaService
    await testOllamaServiceDirectly();
    
    logger.info('所有测试完成，AI模块功能正常');
  } catch (error) {
    logger.error(`测试失败: ${error}`);
  }
}

// 如果直接运行此文件，则执行测试
if (require.main === module) {
  runTests();
}

// 导出测试函数以便其他模块使用
export {
  runTests,
  testAIServiceFactory,
  testListModels,
  testCompletion,
  testOllamaServiceDirectly
}; 