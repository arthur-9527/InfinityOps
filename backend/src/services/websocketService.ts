import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { createModuleLogger } from '../utils/logger';
import { config } from '../config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { SSHServiceImpl } from './ssh/sshService';
import { SSHConnectionConfig } from './ssh/ssh.interface';

const logger = createModuleLogger('websocket');
const execAsync = promisify(exec);

// Client connection map
const clients = new Map<string, WebSocket>();

// Client SSH session map
const clientSshSessions = new Map<string, { sessionId: string, connected: boolean }>();

// SSH service instance
const sshService = new SSHServiceImpl();

// 交互式命令列表
const INTERACTIVE_COMMANDS = [
  'nano', 'vim', 'vi', 'less', 'more', 'top', 'htop', 'pico', 
  'emacs', 'joe', 'jed', 'mc', 'watch', 'tail -f', 'man'
];

// 检查命令是否是交互式命令
function isInteractiveCommand(cmd: string): boolean {
  const trimmedCmd = cmd.trim();
  return INTERACTIVE_COMMANDS.some(ic => 
    trimmedCmd === ic || 
    trimmedCmd.startsWith(`${ic} `) ||
    // 增加对vim/nano文件名的支持
    (ic === 'vim' && /^vim\s+\S+/.test(trimmedCmd)) ||
    (ic === 'nano' && /^nano\s+\S+/.test(trimmedCmd)) ||
    (ic === 'less' && /^less\s+\S+/.test(trimmedCmd)) ||
    (ic === 'more' && /^more\s+\S+/.test(trimmedCmd))
  );
}

/**
 * Process SSH connection command
 */
async function processSshConnectionCommand(command: string, clientId: string): Promise<any> {
  // Simple SSH command pattern matching: ssh username@host or ssh -p port username@host
  const sshCommandRegex = /^ssh\s+(?:-p\s+(\d+)\s+)?([^@\s]+)@([^\s]+)$/i;
  const match = command.match(sshCommandRegex);
  
  if (!match) {
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: 'Invalid SSH command format. Use: ssh username@host or ssh -p port username@host',
        success: false
      }
    };
  }
  
  const port = match[1] ? parseInt(match[1], 10) : 22;
  const username = match[2];
  const host = match[3];
  
  logger.info(`[SSH CONNECTION REQUEST] ${clientId}: ${username}@${host}:${port}`);
  
  try {
    // Close existing session if any
    const existingSession = clientSshSessions.get(clientId);
    if (existingSession && existingSession.sessionId) {
      await sshService.closeSession(existingSession.sessionId);
    }
    
    // Create a new SSH config
    const sshConfig: SSHConnectionConfig = {
      host,
      port,
      username,
      // We'll prompt for password later
    };
    
    // Store pending connection info (not connected yet)
    clientSshSessions.set(clientId, {
      sessionId: '', // Will be updated after connection
      connected: false
    });
    
    return {
      type: 'sshConnectionRequest',
      timestamp: Date.now(),
      payload: {
        host,
        port,
        username,
        displayHost: 'server',
        requiresPassword: true
      }
    };
  } catch (error) {
    logger.error(`SSH connection preparation failed: ${error}`);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: `Failed to prepare SSH connection: ${(error as Error).message}`,
        success: false
      }
    };
  }
}

/**
 * Complete SSH connection with password
 */
async function completeSshConnection(clientId: string, config: SSHConnectionConfig): Promise<any> {
  try {
    logger.info(`[SSH AUTH ATTEMPT] ${clientId}: ${config.username}@${config.host}:${config.port}`);
    
    // 创建一个新的SSH会话，使用固定的终端大小
    const TERM_COLS = 80;
    const TERM_ROWS = 24;
    
    // 创建会话
    const session = await sshService.createSession(config, {
      rows: TERM_ROWS,
      cols: TERM_COLS,
      term: 'xterm-256color'
    });
    
    // 存储会话信息
    clientSshSessions.set(clientId, {
      sessionId: session.id,
      connected: true
    });
    
    // 设置数据事件转发
    session.on('data', (data: string) => {
      // 记录SSH输出
      logger.info(`[SSH OUTPUT] ${clientId}: ${data.replace(/\r\n/g, '\\r\\n').replace(/\n/g, '\\n')}`);
      
      const client = clients.get(clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        // 直接将SSH输出传递给客户端，不做任何处理
        client.send(JSON.stringify({
          type: 'sshData',
          timestamp: Date.now(),
          payload: {
            data
          }
        }));
      }
    });
    
    // 处理会话关闭
    session.on('close', () => {
      logger.info(`[SSH SESSION CLOSED] ${clientId}`);
      clientSshSessions.delete(clientId);
      const client = clients.get(clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'sshDisconnected',
          timestamp: Date.now(),
          payload: {
            message: 'SSH connection closed'
          }
        }));
      }
    });
    
    logger.info(`[SSH CONNECTION ESTABLISHED] ${clientId}: ${config.username}@${config.host}:${config.port}`);
    return {
      type: 'sshConnected',
      timestamp: Date.now(),
      payload: {
        sessionId: session.id,
        host: config.host,
        username: config.username,
        displayHost: 'server',
        termRows: TERM_ROWS,
        termCols: TERM_COLS
      }
    };
  } catch (error) {
    logger.error(`[SSH CONNECTION FAILED] ${clientId}: ${error}`);
    clientSshSessions.delete(clientId);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        output: `Failed to connect to SSH server: ${(error as Error).message}`,
        success: false
      }
    };
  }
}

/**
 * Process SSH command
 */
async function processSshCommand(command: string, clientId: string): Promise<any> {
  const sessionInfo = clientSshSessions.get(clientId);
  if (!sessionInfo || !sessionInfo.connected) {
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: 'No active SSH connection. Please connect first using: ssh username@host',
        success: false
      }
    };
  }
  
  const session = sshService.getSession(sessionInfo.sessionId);
  if (!session) {
    clientSshSessions.delete(clientId);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: 'SSH session not found or expired. Please reconnect.',
        success: false
      }
    };
  }
  
  try {
    // 记录SSH输入
    logger.info(`[SSH INPUT] ${clientId}: ${command}`);
    
    // 直接将命令发送到SSH会话，始终添加换行符
    session.write(command + '\n');
    
    // 命令已发送的通知
    return {
      type: 'commandSent',
      timestamp: Date.now(),
      payload: {
        command,
        success: true
      }
    };
  } catch (error) {
    logger.error(`Error sending command to SSH: ${error}`);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: `Error sending command: ${(error as Error).message}`,
        success: false
      }
    };
  }
}

/**
 * 处理终端命令并返回结果
 */
async function processTerminalCommand(command: string, path: string): Promise<string> {
  try {
    logger.info(`执行终端命令: ${command}, 路径: ${path}`);
    
    // 模拟路径映射 - 在实际生产环境中，应该进行更严格的验证和安全检查
    const resolvedPath = path === '~' ? '/home/test' : path;
    
    // 简单的命令处理 - 这里只是模拟，实际生产环境需要更严格的安全措施
    if (command.trim() === 'clear') {
      return ''; // 特殊处理clear命令
    }
    
    // 通过child_process.exec执行命令
    // 注意：这里直接执行用户输入的命令存在安全风险，实际应用中应该进行严格的输入验证和限制
    const { stdout, stderr } = await execAsync(command, { 
      cwd: resolvedPath,
      timeout: 5000, // 5秒超时
      maxBuffer: 1024 * 1024 // 1MB缓冲区
    });
    
    if (stderr) {
      logger.warn(`命令执行产生错误: ${stderr}`);
      return stderr;
    }
    
    logger.info(`命令执行成功: ${command}`);
    return stdout;
  } catch (error) {
    logger.error(`命令执行失败: ${error}`);
    return `Error: ${(error as Error).message}`;
  }
}

/**
 * Process raw input from interactive terminal
 */
async function processRawInput(command: string, clientId: string): Promise<any> {
  const sessionInfo = clientSshSessions.get(clientId);
  if (!sessionInfo || !sessionInfo.connected) {
    logger.warn(`Client ${clientId} not connected to SSH but sending raw input`);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        output: 'No active SSH connection for raw input.',
        success: false
      }
    };
  }
  
  const session = sshService.getSession(sessionInfo.sessionId);
  if (!session) {
    logger.error(`SSH session not found for client ${clientId}`);
    clientSshSessions.delete(clientId);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        output: 'SSH session lost. Please reconnect.',
        success: false
      }
    };
  }
  
  try {
    // 记录SSH原始输入（如键盘按键）
    // 对于不可打印字符，转换为其ASCII码表示
    const printableCommand = command.split('').map(char => {
      const code = char.charCodeAt(0);
      if (code < 32 || code === 127) { // 控制字符
        return `[CTRL:${code}]`;
      }
      return char;
    }).join('');
    
    logger.info(`[SSH RAW INPUT] ${clientId}: ${printableCommand}`);
    
    // 直接发送原始输入到SSH会话，不做任何处理
    session.write(command);
    // 不需要响应，SSH的响应将通过数据事件发送回客户端
    return null;
  } catch (error) {
    logger.error(`Error sending raw input to SSH: ${error}`);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        output: `Error sending input: ${(error as Error).message}`,
        success: false
      }
    };
  }
}

/**
 * Create a WebSocket server
 */
export function createWebSocketServer(): WebSocketServer {
  logger.info(`Initializing WebSocket server on port ${config.ws.port}...`);
  
  const wss = new WebSocketServer({ 
    port: parseInt(config.ws.port as string, 10) 
  });

  // 服务器开始监听
  wss.on('listening', () => {
    logger.info(`WebSocket server started on port ${config.ws.port}`);
  });

  // 处理新的连接
  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const clientId = request.headers['sec-websocket-key'] || `client-${Date.now()}`;
    const ip = request.socket.remoteAddress;
    
    clients.set(clientId, ws);
    
    logger.info(`Client connected: ${clientId} from ${ip}`);

    // 连接建立后立即发送欢迎消息
    try {
      const welcomeMessage = { 
        type: 'connected', 
        message: 'Connected to InfinityOps WebSocket server',
        timestamp: Date.now(),
        clientId: clientId
      };
      
      ws.send(JSON.stringify(welcomeMessage));
    } catch (error) {
      logger.error(`Error sending welcome message: ${error}`);
    }

    // 处理来自客户端的消息
    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        logger.info(`Received message: type=${data.type} from ${clientId}`);
        
        // 处理不同类型的消息
        switch (data.type) {
          case 'ping':
            ws.send(JSON.stringify({ 
              type: 'pong', 
              timestamp: Date.now(),
              payload: { 
                pingReceived: Date.now(),
                clientId: clientId
              } 
            }));
            break;
          
          case 'terminalCommand':
            // 处理终端命令
            if (data.payload && data.payload.command) {
              const { command, path = '~', isRawInput = false } = data.payload;
              logger.info(`Terminal command received: ${isRawInput ? 'raw input' : command}`);
              
              try {
                let response;
                
                // 检查是否是SSH连接请求
                if (command.trim().toLowerCase().startsWith('ssh ')) {
                  response = await processSshConnectionCommand(command, clientId);
                } 
                // 如果是已连接SSH的原始输入（字符按键）
                else if (isRawInput) {
                  response = await processRawInput(command, clientId);
                } 
                // 如果已连接SSH的完整命令
                else if (clientSshSessions.get(clientId)?.connected) {
                  response = await processSshCommand(command, clientId);
                }
                // 非SSH连接时的本地命令
                else {
                  // 使用本地终端处理
                  const output = await processTerminalCommand(command, path);
                  
                  // 记录本地命令及输出
                  logger.info(`[LOCAL CMD] ${clientId}: ${command}`);
                  logger.info(`[LOCAL OUTPUT] ${clientId}: ${output.substring(0, 500)}${output.length > 500 ? '...(truncated)' : ''}`);
                  
                  response = {
                    type: 'terminalResponse',
                    timestamp: Date.now(),
                    payload: {
                      command,
                      output,
                      success: true
                    }
                  };
                }
                
                // 只有当response不为null时才发送响应
                if (response) {
                  ws.send(JSON.stringify(response));
                }
              } catch (cmdError) {
                logger.error(`Failed to process terminal command: ${cmdError}`);
                ws.send(JSON.stringify({
                  type: 'terminalResponse',
                  timestamp: Date.now(),
                  payload: {
                    command,
                    output: `Error processing command: ${(cmdError as Error).message}`,
                    path,
                    success: false
                  }
                }));
              }
            } else {
              logger.warn('Invalid terminal command format');
              ws.send(JSON.stringify({
                type: 'terminalResponse',
                timestamp: Date.now(),
                payload: {
                  output: 'Invalid command format',
                  success: false
                }
              }));
            }
            break;
            
          case 'sshPasswordAuth':
            if (data.payload && data.payload.password) {
              const sessionInfo = clientSshSessions.get(clientId);
              if (!sessionInfo) {
                ws.send(JSON.stringify({
                  type: 'terminalResponse',
                  timestamp: Date.now(),
                  payload: {
                    output: 'No pending SSH connection request',
                    success: false
                  }
                }));
                break;
              }
                
              const { host, port, username } = data.payload;
              // 记录密码认证尝试，不记录密码内容
              logger.info(`[SSH PASSWORD AUTH] ${clientId}: ${username}@${host}:${port}`);
              
              const config: SSHConnectionConfig = {
                host,
                port,
                username,
                password: data.payload.password
              };
                
              try {
                const response = await completeSshConnection(clientId, config);
                ws.send(JSON.stringify(response));
              } catch (error) {
                logger.error(`[SSH AUTH ERROR] ${clientId}: ${(error as Error).message}`);
                ws.send(JSON.stringify({
                  type: 'terminalResponse',
                  timestamp: Date.now(),
                  payload: {
                    output: `SSH connection failed: ${(error as Error).message}`,
                    success: false
                  }
                }));
              }
            }
            break;
            
          case 'sshResize':
            if (data.payload && data.payload.rows && data.payload.cols) {
              const sessionInfo = clientSshSessions.get(clientId);
              if (sessionInfo && sessionInfo.connected) {
                const session = sshService.getSession(sessionInfo.sessionId);
                if (session) {
                  logger.info(`[SSH RESIZE] ${clientId}: rows=${data.payload.rows}, cols=${data.payload.cols}`);
                  session.resize(data.payload.rows, data.payload.cols);
                }
              }
            }
            break;
            
          case 'sshDisconnect':
            const sessionInfo = clientSshSessions.get(clientId);
            if (sessionInfo && sessionInfo.sessionId) {
              logger.info(`[SSH DISCONNECT REQUEST] ${clientId}`);
              await sshService.closeSession(sessionInfo.sessionId);
              clientSshSessions.delete(clientId);
              ws.send(JSON.stringify({
                type: 'sshDisconnected',
                timestamp: Date.now(),
                payload: {
                  message: 'SSH connection closed'
                }
              }));
            }
            break;
            
          // 添加更多消息类型处理
          default:
            logger.warn(`Unknown message type: "${data.type}"`);
        }
      } catch (error) {
        logger.error(`Error processing message: ${error}`);
        // 尝试发送错误响应
        try {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Failed to process message',
            error: (error as Error).message,
            timestamp: Date.now() 
          }));
        } catch (sendError) {
          logger.error(`Failed to send error response: ${sendError}`);
        }
      }
    });

    // 处理客户端断开连接
    ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString() || 'No reason provided';
      logger.info(`Client disconnected: ${clientId}, code: ${code}`);
      clients.delete(clientId);
      
      // Close any SSH sessions for this client
      const sessionInfo = clientSshSessions.get(clientId);
      if (sessionInfo && sessionInfo.sessionId) {
        logger.info(`[SSH SESSION CLEANUP] ${clientId}`);
        sshService.closeSession(sessionInfo.sessionId).catch(err => {
          logger.error(`Error closing SSH session: ${err}`);
        });
        clientSshSessions.delete(clientId);
      }
    });

    // 处理连接错误
    ws.on('error', (error) => {
      logger.error(`WebSocket error for client ${clientId}: ${error}`);
      try {
        ws.close(1011, 'Internal server error');
      } catch (closeError) {
        // 静默处理关闭错误
      }
    });
  });

  // 处理服务器错误
  wss.on('error', (error) => {
    logger.error(`WebSocket server error: ${error.toString()}`);
  });

  // 处理服务器关闭
  wss.on('close', () => {
    logger.info('WebSocket server closed');
    clients.clear();
    
    // Clear all client histories
    clientSshSessions.clear();
  });

  return wss;
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcastMessage(message: any): void {
  const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
  logger.info(`Broadcasting message to ${clients.size} clients`);
  
  let successCount = 0;
  let failCount = 0;
  
  clients.forEach((client, id) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageStr);
        successCount++;
      } catch (error) {
        logger.error(`Failed to send broadcast to client ${id}: ${error}`);
        failCount++;
      }
    } else {
      failCount++;
    }
  });
  
  if (failCount > 0) {
    logger.info(`Broadcast results: ${successCount} successful, ${failCount} failed`);
  }
}

/**
 * Send a message to a specific client
 */
export function sendToClient(clientId: string, message: any): boolean {
  const client = clients.get(clientId);
  const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
  
  if (!client) {
    logger.warn(`Cannot send message: client ${clientId} not found`);
    return false;
  }
  
  if (client.readyState !== WebSocket.OPEN) {
    logger.warn(`Cannot send message: connection not open`);
    return false;
  }
  
  try {
    client.send(messageStr);
    return true;
  } catch (error) {
    logger.error(`Error sending message: ${error}`);
    return false;
  }
}

/**
 * Get the number of connected clients
 */
export function getConnectedClientsCount(): number {
  return clients.size;
}

/**
 * Get all connected client IDs
 */
export function getConnectedClientIds(): string[] {
  return Array.from(clients.keys());
} 