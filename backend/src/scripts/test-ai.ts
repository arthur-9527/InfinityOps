#!/usr/bin/env node
/**
 * AI模块测试脚本
 * 
 * 运行方式:
 * ts-node src/scripts/test-ai.ts
 * 
 * 如果想单独测试某个功能，可以通过命令行参数指定:
 * ts-node src/scripts/test-ai.ts factory - 只测试工厂
 * ts-node src/scripts/test-ai.ts models - 只测试模型列表
 * ts-node src/scripts/test-ai.ts completion - 只测试补全功能
 * ts-node src/scripts/test-ai.ts ollama - 只测试Ollama服务
 */

import { createModuleLogger } from '../utils/logger';
import { 
  runTests, 
  testAIServiceFactory, 
  testListModels, 
  testCompletion, 
  testOllamaServiceDirectly 
} from '../tests/ai.test';

const logger = createModuleLogger('test-ai-script');

// 解析命令行参数
const args = process.argv.slice(2);
const testType = args[0]?.toLowerCase();

async function run() {
  logger.info('AI模块测试脚本启动');
  logger.info(`Ollama服务URL: ${process.env.OLLAMA_API_URL || 'http://localhost:11434'}`);
  
  try {
    switch (testType) {
      case 'factory':
        logger.info('运行AI服务工厂测试');
        await testAIServiceFactory();
        break;
        
      case 'models':
        logger.info('运行模型列表测试');
        const aiService = await testAIServiceFactory();
        await testListModels(aiService);
        break;
        
      case 'completion':
        logger.info('运行文本补全测试');
        const aiServiceForCompletion = await testAIServiceFactory();
        await testCompletion(aiServiceForCompletion);
        break;
        
      case 'ollama':
        logger.info('运行Ollama服务测试');
        await testOllamaServiceDirectly();
        break;
        
      default:
        logger.info('运行所有测试');
        await runTests();
    }
    
    logger.info('测试脚本执行完成');
  } catch (error) {
    logger.error(`测试脚本执行失败: ${error}`);
    process.exit(1);
  }
}

// 执行测试
run(); 