import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { createModuleLogger } from '../utils/logger';

const logger = createModuleLogger('auth-guard');

@Injectable()
export class AuthGuard implements CanActivate {
  /**
   * 验证WebSocket连接的权限
   */
  canActivate(context: ExecutionContext): boolean {
    try {
      // 如果是WebSocket连接
      if (context.getType() === 'ws') {
        const client: Socket = context.switchToWs().getClient();
        return this.validateWsConnection(client);
      }

      // 如果是HTTP请求
      return this.validateHttpRequest(context);
    } catch (error) {
      logger.error(`认证失败: ${(error as Error).message}`);
      throw new WsException('认证失败');
    }
  }

  /**
   * 验证WebSocket连接
   * 可以在此处实现Token验证、JWT验证等
   */
  private validateWsConnection(client: Socket): boolean {
    try {
      // 获取连接中的认证信息
      const token = client.handshake.auth.token || client.handshake.headers.authorization;
      
      // TODO: 实际的Token验证逻辑应该在此处实现
      // 此处暂时允许所有连接，实际项目中应该根据需求实现认证逻辑
      
      // 打印日志但通过验证 (开发环境)
      if (!token) {
        logger.warn(`WebSocket连接未提供认证Token: ${client.id}`);
      } else {
        logger.info(`WebSocket连接验证通过: ${client.id}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`WebSocket连接验证失败: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 验证HTTP请求
   * 可以在此处实现Token验证、JWT验证等
   */
  private validateHttpRequest(context: ExecutionContext): boolean {
    try {
      const request = context.switchToHttp().getRequest();
      const token = request.headers.authorization;
      
      // TODO: 实际的Token验证逻辑应该在此处实现
      // 此处暂时允许所有请求，实际项目中应该根据需求实现认证逻辑
      
      // 打印日志但通过验证 (开发环境)
      if (!token) {
        logger.warn(`HTTP请求未提供认证Token: ${request.url}`);
      } else {
        logger.info(`HTTP请求验证通过: ${request.url}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`HTTP请求验证失败: ${(error as Error).message}`);
      return false;
    }
  }
} 