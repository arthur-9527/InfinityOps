import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { createModuleLogger } from '../utils/logger';
import { config } from '../config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { commandAnalysisService } from './commandAnalysisService';
import { AIMessage } from '../modules/ai/ai.interface';

const logger = createModuleLogger('websocket');
const execAsync = promisify(exec);

// Client connection map
const clients = new Map<string, WebSocket>();

// Message history for AI context (keep limited history per client)
const clientMessageHistory = new Map<string, AIMessage[]>();
const MAX_HISTORY_LENGTH = 10;

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
 * Process terminal command through AI analysis
 */
async function processCommandWithAI(command: string, path: string, clientId: string): Promise<any> {
  // Get command history for this client (or initialize empty)
  const history = clientMessageHistory.get(clientId) || [];
  logger.info(`Command history for client ${clientId}: ${JSON.stringify(history)}`);
  logger.info(`Command: ${command}`);
  logger.info(`Path: ${path}`);
  // Analyze the command using AI
  const analysisResult = await commandAnalysisService.analyzeCommand(command, path, history);
  
  // If this is a bash command that should be executed
  if (analysisResult.type === 'bash_execution' && analysisResult.shouldExecute && (analysisResult.command || analysisResult.bypassedAI)) {
    try {
      // Use the analyzed command or the original if it was bypassed
      const cmdToExecute = analysisResult.command || command;
      
      // Execute the command and get output
      const cmdOutput = await processTerminalCommand(cmdToExecute, path);
      
      // Update the result content with command output
      analysisResult.content = cmdOutput;
      analysisResult.success = true;
    } catch (error) {
      // Update result if execution failed
      analysisResult.content = `Error executing command: ${(error as Error).message}`;
      analysisResult.success = false;
    }
  }
  
  // Don't update history for bypassed AI commands to keep the context clean
  if (!analysisResult.bypassedAI) {
    // Update conversation history
    updateClientHistory(clientId, command, analysisResult.content);
  }
  
  return {
    type: 'terminalResponse',
    timestamp: Date.now(),
    payload: {
      command,
      output: analysisResult.content,
      analysisType: analysisResult.type,
      path,
      success: analysisResult.success,
      bypassedAI: analysisResult.bypassedAI || false
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