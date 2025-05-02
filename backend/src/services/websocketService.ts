import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { createModuleLogger } from '../utils/logger';
import { config } from '../config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { commandAnalysisService } from './commandAnalysisService';
import { AIMessage } from '../modules/ai/ai.interface';
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

// Message history for AI context (keep limited history per client)
const clientMessageHistory = new Map<string, AIMessage[]>();
const MAX_HISTORY_LENGTH = 10;

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
  
  logger.info(`Attempting SSH connection: ${username}@${host}:${port}`);
  
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
    logger.info(`Connecting to SSH: ${config.username}@${config.host}:${config.port}`);
    
    // Create a new SSH session
    const session = await sshService.createSession(config, {
      rows: 24,
      cols: 80,
      term: 'xterm-256color'
    });
    
    // Store session info
    clientSshSessions.set(clientId, {
      sessionId: session.id,
      connected: true
    });
    
    // Set up data event forwarding
    session.on('data', (data: string) => {
      const client = clients.get(clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'sshData',
          timestamp: Date.now(),
          payload: {
            data
          }
        }));
      }
    });
    
    // Handle session close
    session.on('close', () => {
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
    
    logger.info(`SSH connection established for client ${clientId}`);
    return {
      type: 'sshConnected',
      timestamp: Date.now(),
      payload: {
        sessionId: session.id,
        host: config.host,
        username: config.username,
        displayHost: 'server'
      }
    };
  } catch (error) {
    logger.error(`SSH connection failed: ${error}`);
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
    // Send command to SSH session
    session.write(command + '\n');
    
    // No immediate response, as the output will come through the SSH data event
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
 * Process terminal command through AI analysis and then forward to SSH
 */
async function processCommandWithAI(command: string, path: string, clientId: string): Promise<any> {
  // SSH连接命令处理
  if (command.trim().toLowerCase().startsWith('ssh ')) {
    return processSshConnectionCommand(command, clientId);
  }
  
  // 获取命令历史记录
  const history = clientMessageHistory.get(clientId) || [];
  logger.info(`Command history for client ${clientId}: ${JSON.stringify(history)}`);
  logger.info(`Command: ${command}`);
  logger.info(`Path: ${path}`);
  
  // 检查SSH连接状态
  const sessionInfo = clientSshSessions.get(clientId);
  const isConnected = sessionInfo && sessionInfo.connected;
  
  // 未连接SSH时，显示错误提示
  if (!isConnected) {
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
  
  // 检查是否需要直接处理确认响应
  const isConfirmationResponse = /(^|\s+)(y|yes|n|no)(\s+|$)/i.test(command.trim().toLowerCase());
  
  // 使用AI分析命令
  const analysisResult = await commandAnalysisService.analyzeCommand(command, path, history);
  
  // 如果命令是对前一个风险命令的确认响应
  if (analysisResult.isAwaitingConfirmation === false && isConfirmationResponse) {
    // 这是确认响应的结果，特殊处理
    if (analysisResult.shouldExecute) {
      // 用户确认执行命令
      // 获取原始命令
      const originalCommand = analysisResult.command || '';
      
      // 获取SSH会话
      const session = sshService.getSession(sessionInfo.sessionId);
      if (!session) {
        logger.error(`SSH session not found for client ${clientId}`);
        clientSshSessions.delete(clientId);
        return {
          type: 'terminalResponse',
          timestamp: Date.now(),
          payload: {
            command: originalCommand,
            output: 'SSH session not found or expired. Please reconnect.',
            success: false
          }
        };
      }
      
      try {
        // 执行原始命令
        logger.info(`Executing confirmed command via SSH: ${originalCommand}`);
        
        // 立即将命令发送到SSH会话
        session.write(originalCommand + '\n');
        
        // 返回空响应，SSH会显示结果
        return {
          type: 'commandSent',
          timestamp: Date.now(),
          payload: {
            command: originalCommand,
            success: true,
            isConfirmed: true,
            immediateExecution: true  // 标记为立即执行
          }
        };
      } catch (error) {
        logger.error(`Error sending confirmed command to SSH: ${error}`);
        return {
          type: 'terminalResponse',
          timestamp: Date.now(),
          payload: {
            command: originalCommand,
            output: `Error sending command: ${(error as Error).message}`,
            success: false
          }
        };
      }
    } else {
      // 用户拒绝执行命令
      return {
        type: 'terminalResponse',
        timestamp: Date.now(),
        payload: {
          command: command,
          output: analysisResult.content,
          analysisType: 'command_cancelled',
          path,
          success: false
        }
      };
    }
  }
  
  // 对于普通的分析结果，继续原有流程
  // 根据AI分析结果处理命令
  if (analysisResult.type === 'ai_response') {
    // AI回答类型直接返回AI的回答
    updateClientHistory(clientId, command, analysisResult.content);
    
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: analysisResult.content,
        analysisType: analysisResult.type,
        path,
        success: analysisResult.success,
        bypassedAI: false
      }
    };
  } else if (analysisResult.type === 'bash_execution') {
    // 检查是否需要确认
    if (analysisResult.requireConfirmation && analysisResult.isAwaitingConfirmation) {
      return {
        type: 'terminalResponse',
        timestamp: Date.now(),
        payload: {
          command,
          output: analysisResult.content,
          analysisType: 'confirmation_required',
          path,
          success: true,
          awaitingConfirmation: true,
          showPrompt: false // 不显示新的命令提示符
        }
      };
    }
    
    // 普通命令执行
    if (analysisResult.shouldExecute) {
      // 获取SSH会话
      const session = sshService.getSession(sessionInfo.sessionId);
      if (!session) {
        logger.error(`SSH session not found for client ${clientId}`);
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
        // 使用AI分析后的命令或原始命令
        const cmdToExecute = analysisResult.command || command;
        
        // 记录日志
        logger.info(`Executing command via SSH: ${cmdToExecute}`);
        
        // 向SSH会话发送命令
        session.write(cmdToExecute + '\n');
        
        // AI对命令有优化或解释时，先显示AI的解释
        if (analysisResult.content && analysisResult.command !== command) {
          // 返回AI的解释，但不在终端显示提示符（因为SSH会返回数据）
          return {
            type: 'terminalResponse',
            timestamp: Date.now(),
            payload: {
              command,
              output: `AI优化：${analysisResult.content}\n执行命令: ${cmdToExecute}`,
              analysisType: 'enhanced_execution',
              path,
              success: true,
              showPrompt: false  // 不显示提示符，等待SSH响应
            }
          };
        }
        
        // 如果没有特别的解释，只发送命令到SSH
        return {
          type: 'commandSent',
          timestamp: Date.now(),
          payload: {
            command: cmdToExecute,
            originalCommand: command,
            aiEnhanced: cmdToExecute !== command,
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
    } else {
      // AI认为不应执行的命令，显示AI的解释
      updateClientHistory(clientId, command, analysisResult.content);
      
      return {
        type: 'terminalResponse',
        timestamp: Date.now(),
        payload: {
          command,
          output: analysisResult.content,
          analysisType: 'command_warning',
          path,
          success: false
        }
      };
    }
  }

  // 如果无法确定类型，返回错误
  return {
    type: 'terminalResponse',
    timestamp: Date.now(),
    payload: {
      command,
      output: 'Error: Unable to determine command type',
      path,
      success: false
    }
  };
}

/**
 * Update client conversation history
 */
function updateClientHistory(clientId: string, userCommand: string, aiResponse: string): void {
  // Get existing history or initialize new one
  let history = clientMessageHistory.get(clientId) || [];
  
  // Add new messages
  history.push({ role: 'user', content: userCommand });
  history.push({ role: 'assistant', content: aiResponse });
  
  // Keep history length limited
  if (history.length > MAX_HISTORY_LENGTH * 2) { // *2 because each exchange is 2 messages
    history = history.slice(-MAX_HISTORY_LENGTH * 2);
  }
  
  // Update history in the map
  clientMessageHistory.set(clientId, history);
}

/**
 * Clear client conversation history
 */
function clearClientHistory(clientId: string): void {
  clientMessageHistory.delete(clientId);
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
              const { command, path = '~' } = data.payload;
              logger.info(`Terminal command received: ${command}`);
              
              try {
                // Process through AI instead of direct execution
                const response = await processCommandWithAI(command, path, clientId);
                ws.send(JSON.stringify(response));
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
            
          case 'clearHistory':
            // Clear conversation history for this client
            clearClientHistory(clientId);
            ws.send(JSON.stringify({
              type: 'historyCleared',
              timestamp: Date.now(),
              payload: {
                success: true
              }
            }));
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
                  session.resize(data.payload.rows, data.payload.cols);
                }
              }
            }
            break;
            
          case 'sshDisconnect':
            const sessionInfo = clientSshSessions.get(clientId);
            if (sessionInfo && sessionInfo.sessionId) {
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
      
      // Clean up client history when disconnected
      clearClientHistory(clientId);
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
    clientMessageHistory.clear();
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