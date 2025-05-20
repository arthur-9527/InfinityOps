#!/usr/bin/env node
import dotenv from 'dotenv';
import { AIFactory } from './aiFactory';
import { createModuleLogger } from '../../utils/logger';

// 加载环境变量
dotenv.config();

const logger = createModuleLogger('AI Test');

async function testAI() {
  logger.info('Testing AI service...');
  
  try {
    // 使用工厂类创建Ollama服务
    const aiService = AIFactory.createOllamaService();
    const config = aiService.getConfig();
    
    logger.info(`Using AI provider: ${config.provider}, model: ${config.model}`);
    logger.info(`Base URL: ${config.baseURL}`);
    
    // 测试简单对话
    const prompt = 'Hello, what can you do?';
    logger.info(`Sending prompt: "${prompt}"`);
    
    const response = await aiService.callAI({
      prompt,
      systemPrompt: 'You are a helpful assistant who responds briefly.',
      temperature: 0.7,
    });
    
    logger.info('Response received:');
    logger.info('-'.repeat(50));
    logger.info(response.text);
    logger.info('-'.repeat(50));
    
    if (response.usage) {
      logger.info(`Token usage - Prompt: ${response.usage.promptTokens}, Completion: ${response.usage.completionTokens}, Total: ${response.usage.totalTokens}`);
    }
    
    logger.info('AI test completed successfully!');
  } catch (error) {
    logger.error('Error testing AI service:', error);
  }
}

// 执行测试
testAI(); 