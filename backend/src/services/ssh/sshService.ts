import { Injectable } from '@nestjs/common';
import { createModuleLogger } from '../../utils/logger';
import { SSHConnectionConfig, SSHService, SSHSession, SSHSessionOptions } from './ssh.interface';
import { SSHSessionImpl } from './sshSession';

const logger = createModuleLogger('ssh-service');

/**
 * SSH服务实现
 */
@Injectable()
export class SSHServiceImpl implements SSHService {
  private sessions: Map<string, SSHSession> = new Map();

  /**
   * 创建SSH会话
   */
  async createSession(config: SSHConnectionConfig, options?: SSHSessionOptions): Promise<SSHSession> {
    try {
      logger.info(`创建SSH会话: ${config.username}@${config.host}:${config.port}`);
      
      // 创建会话
      const session = new SSHSessionImpl(config);
      
      // 连接到服务器
      await (session as SSHSessionImpl).connect(options);
      
      // 存储会话
      this.sessions.set(session.id, session);
      
      // 添加关闭事件监听
      session.on('closed', () => {
        logger.info(`会话已关闭，移除会话: ${session.id}`);
        this.sessions.delete(session.id);
      });
      
      return session;
    } catch (error) {
      logger.error(`创建SSH会话失败: ${(error as Error).message}`);
      throw error;
    }
  }

  /**
   * 获取会话
   */
  getSession(id: string): SSHSession | null {
    const session = this.sessions.get(id);
    if (!session) {
      logger.warn(`获取会话失败，未找到ID: ${id}`);
      return null;
    }
    return session;
  }

  /**
   * 关闭会话
   */
  async closeSession(id: string): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) {
      logger.warn(`关闭会话失败，未找到ID: ${id}`);
      return false;
    }
    
    try {
      logger.info(`关闭会话: ${id}`);
      session.close();
      this.sessions.delete(id);
      return true;
    } catch (error) {
      logger.error(`关闭会话出错: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 获取所有活跃会话
   */
  getActiveSessions(): SSHSession[] {
    return Array.from(this.sessions.values());
  }
} 