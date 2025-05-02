import { Client, ClientChannel, PseudoTtyOptions, ClientCallback } from 'ssh2';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { createModuleLogger } from '../../utils/logger';
import { SSHConnectionConfig, SSHSession, SSHSessionOptions } from './ssh.interface';

const logger = createModuleLogger('ssh-session');

/**
 * SSH会话实现类
 */
export class SSHSessionImpl extends EventEmitter implements SSHSession {
  id: string;
  connectionConfig: SSHConnectionConfig;
  private client: Client;
  private channel?: ClientChannel;
  private connected: boolean = false;
  private connecting: boolean = false;

  /**
   * 创建SSH会话实例
   */
  constructor(config: SSHConnectionConfig) {
    super();
    this.connectionConfig = { ...config };
    this.id = crypto.randomUUID();
    this.client = new Client();
    
    // 设置最大监听器数量
    this.setMaxListeners(20);
    
    // 监听SSH客户端事件
    this.setupClientListeners();
  }
  
  /**
   * 设置SSH客户端事件监听
   */
  private setupClientListeners(): void {
    // 连接就绪
    this.client.on('ready', () => {
      logger.info(`SSH连接就绪: ${this.connectionConfig.username}@${this.connectionConfig.host}`);
      this.connected = true;
      this.connecting = false;
      this.emit('ready');
    });
    
    // 连接错误
    this.client.on('error', (err: Error) => {
      logger.error(`SSH连接错误: ${err.message}`);
      this.connected = false;
      this.connecting = false;
      this.emit('error', err);
    });
    
    // 连接关闭
    this.client.on('close', () => {
      logger.info(`SSH连接关闭: ${this.connectionConfig.username}@${this.connectionConfig.host}`);
      this.connected = false;
      this.connecting = false;
      this.emit('close');
    });
    
    // 连接结束
    this.client.on('end', () => {
      logger.info(`SSH连接结束: ${this.connectionConfig.username}@${this.connectionConfig.host}`);
      this.connected = false;
      this.connecting = false;
      this.emit('end');
    });
    
    // 连接警告 (使用类型断言，因为@types/ssh2未声明warning事件)
    this.client.on('warning' as any, (warning: Error) => {
      logger.warn(`SSH连接警告: ${warning.message}`);
      this.emit('warning', warning);
    });
    
    // 连接超时
    this.client.on('timeout', () => {
      logger.warn(`SSH连接超时: ${this.connectionConfig.username}@${this.connectionConfig.host}`);
      this.connected = false;
      this.connecting = false;
      this.emit('timeout');
    });

    // 监听Banner信息
    this.client.on('banner', (message: string) => {
      logger.info(`SSH Banner: ${message}`);
      this.emit('banner', message);
    });
  }
  
  /**
   * 连接到SSH服务器并创建交互式shell
   */
  async connect(options?: SSHSessionOptions): Promise<void> {
    if (this.connected || this.connecting) {
      logger.warn('SSH会话已连接或正在连接中');
      return;
    }
    
    this.connecting = true;
    
    // 创建连接
    try {
      // 准备SSH连接配置
      const connectConfig: any = {
        host: this.connectionConfig.host,
        port: this.connectionConfig.port,
        username: this.connectionConfig.username,
        keepaliveInterval: this.connectionConfig.keepaliveInterval || 60000, // 默认60秒
        readyTimeout: this.connectionConfig.readyTimeout || 30000, // 默认30秒
        debug: this.connectionConfig.debug ? (message: string) => logger.debug(`SSH2 Debug: ${message}`) : undefined
      };

      // 添加认证方式
      if (this.connectionConfig.password) {
        logger.debug('使用密码认证');
        connectConfig.password = this.connectionConfig.password;
      }

      if (this.connectionConfig.privateKey) {
        logger.debug('使用私钥认证');
        connectConfig.privateKey = this.connectionConfig.privateKey;
        
        if (this.connectionConfig.passphrase) {
          connectConfig.passphrase = this.connectionConfig.passphrase;
        }
      }

      logger.info(`连接到SSH服务器: ${this.connectionConfig.username}@${this.connectionConfig.host}:${this.connectionConfig.port}`);
      
      await new Promise<void>((resolve, reject) => {
        // 移除之前的监听器，防止重复
        this.client.removeAllListeners('ready');
        this.client.removeAllListeners('error');
        
        // 添加一次性监听器
        this.client.once('ready', () => resolve());
        this.client.once('error', (err: Error) => reject(err));
        
        // 使用SSH配置连接
        try {
          this.client.connect(connectConfig);
        } catch (err) {
          reject(err);
        }
      });
      
      // 连接成功，创建shell会话
      const shellOptions: PseudoTtyOptions = {
        term: options?.term || 'xterm-256color',
        rows: options?.rows || 24,
        cols: options?.cols || 80,
      };
      
      logger.info(`创建SSH shell会话: ${JSON.stringify(shellOptions)}`);
      
      // 创建shell
      this.channel = await new Promise<ClientChannel>((resolve, reject) => {
        const callback: ClientCallback = (err: Error | undefined, channel: ClientChannel) => {
          if (err) {
            logger.error(`创建shell失败: ${err.message}`);
            reject(err);
            return;
          }
          
          // 更新连接状态
          this.connected = true;

          // 转发数据事件
          channel.on('data', (data: Buffer) => {
            this.emit('data', data.toString('utf8'));
          });
          
          // 转发关闭事件
          channel.on('close', () => {
            logger.info(`Shell会话关闭: ${this.id}`);
            this.emit('session-close');
          });
          
          // 转发扩展数据(stderr等)
          channel.on('extended data', (type: number, data: Buffer) => {
            this.emit('extended-data', type, data.toString('utf8'));
          });
          
          // 转发退出状态
          channel.on('exit', (code: number, signal: string) => {
            logger.info(`Shell进程退出: 代码=${code}, 信号=${signal}`);
            this.emit('exit', code, signal);
          });
          
          resolve(channel);
        };
        
        this.client.shell(shellOptions, callback);
      });
      
      logger.info(`SSH会话创建成功: id=${this.id}`);
      
    } catch (error) {
      this.connected = false;
      this.connecting = false;
      logger.error(`SSH连接失败: ${(error as Error).message}`);
      throw error;
    }
  }
  
  /**
   * 调整终端大小
   */
  resize(rows: number, cols: number): void {
    if (!this.channel) {
      logger.warn(`无法调整终端大小: 通道未创建`);
      return;
    }
    
    logger.debug(`调整终端大小: rows=${rows}, cols=${cols}`);
    this.channel.setWindow(rows, cols, 0, 0);
  }
  
  /**
   * 向SSH会话写入数据
   */
  write(data: string): void {
    if (!this.channel) {
      logger.warn(`无法写入数据: 通道未创建`);
      return;
    }
    
    logger.debug(`写入数据: ${data.length}字节`);
    this.channel.write(data);
  }
  
  /**
   * 关闭SSH会话
   */
  close(): void {
    logger.info(`关闭SSH会话: id=${this.id}`);
    
    if (this.channel) {
      try {
        this.channel.close();
      } catch (error) {
        logger.error(`关闭通道错误: ${(error as Error).message}`);
      }
      this.channel = undefined;
    }
    
    if (this.client) {
      try {
        this.client.end();
      } catch (error) {
        logger.error(`关闭客户端错误: ${(error as Error).message}`);
      }
    }
    
    this.connected = false;
    this.connecting = false;
    this.emit('closed');
  }
  
  /**
   * 检查会话是否已连接
   */
  isConnected(): boolean {
    return this.connected && this.channel !== undefined;
  }
} 