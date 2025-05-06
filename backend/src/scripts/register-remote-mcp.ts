/**
 * 注册远程MCP服务器的示例脚本
 * 
 * 此脚本演示如何从外部注册一个远程MCP服务器
 * 运行方式: ts-node src/scripts/register-remote-mcp.ts
 */

import { registerRemoteMCPService, unregisterMCPService } from '../modules/mcp';
import { createModuleLogger } from '../utils/logger';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

const logger = createModuleLogger('register-remote-mcp');

async function main() {
  try {
    logger.info('开始注册远程MCP服务器');
    
    // 使用环境变量或默认值
    const remoteUrl = process.env.REMOTE_MCP_URL || 'http://localhost:3001';
    const apiKey = process.env.REMOTE_MCP_API_KEY || 'test-api-key';
    
    // 注册远程MCP服务
    const service = registerRemoteMCPService(
      'remote-command-analysis',
      '远程命令分析服务',
      '连接到外部命令分析服务器',
      {
        url: remoteUrl,
        apiKey: apiKey,
        timeout: 10000,
        maxRetries: 3,
        secure: remoteUrl.startsWith('https'),
        headers: {
          'User-Agent': 'InfinityOps/1.0'
        }
      },
      40 // 优先级
    );
    
    logger.info(`远程MCP服务注册成功: ${service.name} (${service.id})`);
    
    // 测试连接
    const isConnected = await service.testConnection();
    if (isConnected) {
      logger.info('连接测试成功');
      
      // 获取服务状态
      const status = await service.getStatus();
      logger.info(`服务状态: ${JSON.stringify(status)}`);
      
      // 保持服务运行一段时间进行测试
      logger.info('服务注册成功，等待30秒后将取消注册...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // 取消注册服务
      await unregisterMCPService(service.id);
      logger.info('服务已取消注册');
    } else {
      logger.error('连接测试失败，服务可能无法使用');
      
      // 查看服务状态
      const status = await service.getStatus();
      logger.error(`服务状态: ${JSON.stringify(status)}`);
      
      // 尝试更新配置
      logger.info('尝试更新服务配置后重新连接...');
      await service.updateConfig({
        timeout: 20000,  // 增加超时时间
        maxRetries: 5    // 增加重试次数
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
    logger.error(`发生错误: ${error}`);
  }
}

// 运行主函数
main().catch(error => {
  logger.error(`主函数发生错误: ${error}`);
  process.exit(1);
}); 