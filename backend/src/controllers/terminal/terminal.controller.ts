import { Controller, Inject, UseGuards } from '@nestjs/common';
import { 
  OnGatewayConnection, 
  OnGatewayDisconnect, 
  SubscribeMessage, 
  WebSocketGateway, 
  WebSocketServer,
  WsResponse
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { createModuleLogger } from '../../utils/logger';
import { SSHService, SSHConnectionConfig, SSHSessionOptions } from '../../services/ssh';
import { AuthGuard } from '../../guards/auth.guard';

const logger = createModuleLogger('terminal-controller');

interface TerminalData {
  sessionId?: string;
  data?: string;
  cols?: number;
  rows?: number;
  config?: SSHConnectionConfig;
}

/**
 * SSH终端控制器 - WebSocket网关
 */
@WebSocketGateway({
  namespace: 'terminal',
  cors: {
    origin: '*',
  },
})
@UseGuards(AuthGuard)
@Controller()
export class TerminalController implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  // 客户端会话映射
  private clientSessionMap = new Map<string, string>();

  constructor(
    @Inject('SSHService') private readonly sshService: SSHService
  ) {}

  /**
   * 处理WebSocket连接
   */
  handleConnection(client: Socket): void {
    logger.info(`客户端连接: ${client.id}`);
  }

  /**
   * 处理WebSocket断开连接
   */
  async handleDisconnect(client: Socket): Promise<void> {
    // 关闭对应的SSH会话
    const sessionId = this.clientSessionMap.get(client.id);
    if (sessionId) {
      await this.sshService.closeSession(sessionId);
      this.clientSessionMap.delete(client.id);
      logger.info(`客户端断开连接，关闭会话: ${client.id} -> ${sessionId}`);
    } else {
      logger.info(`客户端断开连接: ${client.id}`);
    }
  }

  /**
   * 创建新的SSH会话
   */
  @SubscribeMessage('terminal:connect')
  async handleConnect(client: Socket, payload: TerminalData): Promise<WsResponse<any>> {
    try {
      if (!payload.config) {
        throw new Error('SSH连接配置不能为空');
      }

      // 检查是否已存在会话
      const existingSessionId = this.clientSessionMap.get(client.id);
      if (existingSessionId) {
        // 关闭现有会话
        await this.sshService.closeSession(existingSessionId);
        this.clientSessionMap.delete(client.id);
      }

      // 创建会话选项
      const options: SSHSessionOptions = {
        rows: payload.rows || 24,
        cols: payload.cols || 80,
      };

      // 创建SSH会话
      const session = await this.sshService.createSession(payload.config, options);

      // 记录客户端与会话的映射关系
      this.clientSessionMap.set(client.id, session.id);

      // 监听SSH数据发送到客户端
      session.on('data', (data: string) => {
        client.emit('terminal:data', { data });
      });

      // 监听SSH扩展数据发送到客户端
      session.on('extended-data', (type: number, data: string) => {
        client.emit('terminal:data', { data });
      });

      logger.info(`创建SSH会话成功: ${client.id} -> ${session.id}`);

      return { event: 'terminal:connect', data: { success: true, sessionId: session.id } };
    } catch (error) {
      logger.error(`创建SSH会话失败: ${(error as Error).message}`);
      return { 
        event: 'terminal:connect', 
        data: { 
          success: false, 
          error: (error as Error).message 
        } 
      };
    }
  }

  /**
   * 处理终端输入
   */
  @SubscribeMessage('terminal:input')
  async handleInput(client: Socket, payload: TerminalData): Promise<void> {
    try {
      const sessionId = payload.sessionId || this.clientSessionMap.get(client.id);
      if (!sessionId || !payload.data) {
        return;
      }

      const session = this.sshService.getSession(sessionId);
      if (!session) {
        logger.warn(`会话不存在: ${sessionId}`);
        return;
      }

      // 写入数据到SSH会话
      session.write(payload.data);
    } catch (error) {
      logger.error(`处理终端输入失败: ${(error as Error).message}`);
    }
  }

  /**
   * 调整终端大小
   */
  @SubscribeMessage('terminal:resize')
  async handleResize(client: Socket, payload: TerminalData): Promise<void> {
    try {
      const sessionId = payload.sessionId || this.clientSessionMap.get(client.id);
      if (!sessionId || !payload.cols || !payload.rows) {
        return;
      }

      const session = this.sshService.getSession(sessionId);
      if (!session) {
        logger.warn(`会话不存在: ${sessionId}`);
        return;
      }

      // 调整SSH终端大小
      session.resize(payload.rows, payload.cols);
      logger.debug(`调整终端大小: ${sessionId}, rows=${payload.rows}, cols=${payload.cols}`);
    } catch (error) {
      logger.error(`调整终端大小失败: ${(error as Error).message}`);
    }
  }

  /**
   * 关闭终端会话
   */
  @SubscribeMessage('terminal:disconnect')
  async handleTerminalDisconnect(client: Socket, payload: TerminalData): Promise<WsResponse<any>> {
    try {
      const sessionId = payload.sessionId || this.clientSessionMap.get(client.id);
      if (!sessionId) {
        return { event: 'terminal:disconnect', data: { success: false, error: '未找到会话' } };
      }

      // 关闭会话
      const success = await this.sshService.closeSession(sessionId);
      if (success) {
        this.clientSessionMap.delete(client.id);
        logger.info(`关闭会话成功: ${sessionId}`);
      } else {
        logger.warn(`关闭会话失败: ${sessionId}`);
      }

      return { event: 'terminal:disconnect', data: { success } };
    } catch (error) {
      logger.error(`关闭会话出错: ${(error as Error).message}`);
      return { 
        event: 'terminal:disconnect', 
        data: { 
          success: false, 
          error: (error as Error).message 
        } 
      };
    }
  }
} 