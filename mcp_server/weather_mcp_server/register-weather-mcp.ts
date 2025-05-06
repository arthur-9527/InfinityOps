/**
 * 中国天气查询MCP服务注册示例
 * 
 * 此脚本演示如何将天气查询MCP服务注册到InfinityOps系统中
 * 运行方式: ts-node register-weather-mcp.ts
 */

import { registerRemoteMCPService, unregisterMCPService } from '../backend/src/modules/mcp';
import { createModuleLogger } from '../backend/src/utils/logger';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const logger = createModuleLogger('register-weather-mcp');

async function main() {
  try {
    logger.info('开始注册中国天气查询MCP服务');
    
    // 使用环境变量或默认值
    const remoteUrl = process.env.WEATHER_MCP_URL || 'http://localhost:3001';
    const apiKey = process.env.WEATHER_MCP_API_KEY || 'test-api-key';
    
    // 注册天气查询MCP服务
    const service = registerRemoteMCPService(
      'weather-query',                // 唯一ID
      '中国天气查询服务',              // 用户友好的名称
      '提供全国各地天气查询、预报及预警信息', // 描述
      {
        url: remoteUrl,
        apiKey: apiKey,
        timeout: 5000,
        maxRetries: 2,
        secure: remoteUrl.startsWith('https'),
        headers: {
          'User-Agent': 'InfinityOps/1.0'
        }
      },
      30 // 优先级（数字越小优先级越高）
    );
    
    logger.info(`天气查询MCP服务注册成功: ${service.name} (${service.id})`);
    
    // 测试连接
    const isConnected = await service.testConnection();
    if (isConnected) {
      logger.info('连接测试成功');
      
      // 获取服务状态
      const status = await service.getStatus();
      logger.info(`服务状态: ${JSON.stringify(status)}`);
      
      // 展示如何使用该服务进行天气查询
      logger.info('以下是可以使用的天气查询示例：');
      logger.info('  查询北京天气');
      logger.info('  上海明天会下雨吗');
      logger.info('  广州未来三天天气预报');
      logger.info('  成都的空气质量怎么样');
      logger.info('  杭州现在温度是多少');
      
      // 保持服务运行一段时间进行测试
      logger.info('服务注册成功，等待30秒后将取消注册...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // 取消注册服务
      await unregisterMCPService(service.id);
      logger.info('天气查询MCP服务已取消注册');
    } else {
      logger.error('连接测试失败，服务可能无法使用');
      
      // 查看服务状态
      const status = await service.getStatus();
      logger.error(`服务状态: ${JSON.stringify(status)}`);
      
      // 尝试更新配置
      logger.info('尝试更新服务配置后重新连接...');
      await service.updateConfig({
        timeout: 10000,  // 增加超时时间
        maxRetries: 3    // 增加重试次数
      });
      
      // 再次测试连接
      const retryConnection = await service.testConnection();
      if (retryConnection) {
        logger.info('重试连接成功');
      } else {
        logger.error('重试连接仍然失败，取消注册服务');
        await unregisterMCPService(service.id);
      }
    }
  } catch (error) {
    logger.error(`注册天气MCP服务时发生错误: ${error}`);
  }
}

// 运行主函数
main().catch(error => {
  logger.error(`主函数发生错误: ${error}`);
  process.exit(1);
}); 