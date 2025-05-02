import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { createModuleLogger } from '../utils/logger';
import { config } from '../config';

const logger = createModuleLogger('websocket');

// Client connection map
const clients = new Map<string, WebSocket>();

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
    logger.info(`WebSocket server started and listening on port ${config.ws.port}`);
  });

  // 处理新的连接请求
  wss.on('headers', (headers, request) => {
    const ip = request.socket.remoteAddress;
    const userAgent = request.headers['user-agent'] || 'unknown';
    const origin = request.headers.origin || 'unknown';
    
    logger.info(`WebSocket connection attempt from IP: ${ip}, Origin: ${origin}, User-Agent: ${userAgent}`);
    logger.debug(`Connection headers: ${JSON.stringify(headers)}`);
  });

  // 处理新的连接
  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const clientId = request.headers['sec-websocket-key'] || `client-${Date.now()}`;
    const ip = request.socket.remoteAddress;
    const origin = request.headers.origin || 'unknown';
    const path = request.url || '/';
    
    clients.set(clientId, ws);
    
    logger.info(`Client connected: ${clientId} from ${ip} (origin: ${origin}, path: ${path})`);
    logger.debug(`Total connected clients: ${clients.size}`);

    // 连接建立后立即发送欢迎消息
    try {
      const welcomeMessage = { 
        type: 'connected', 
        message: 'Connected to InfinityOps WebSocket server',
        timestamp: Date.now(),
        clientId: clientId
      };
      const messageStr = JSON.stringify(welcomeMessage);
      
      logger.debug(`Sending welcome message to client ${clientId}: ${messageStr}`);
      ws.send(messageStr);
    } catch (error) {
      logger.error(`Error sending welcome message to client ${clientId}: ${error}`);
    }

    // 处理来自客户端的消息
    ws.on('message', (message: Buffer) => {
      try {
        const messageStr = message.toString();
        logger.debug(`Raw message received from ${clientId}: ${messageStr}`);
        
        const data = JSON.parse(messageStr);
        logger.info(`Received message from ${clientId}: type=${data.type}, payload=${JSON.stringify(data.payload || {})}`);
        
        // 处理不同类型的消息
        switch (data.type) {
          case 'ping':
            logger.debug(`Ping received from ${clientId}, sending pong response`);
            ws.send(JSON.stringify({ 
              type: 'pong', 
              timestamp: Date.now(),
              payload: { 
                pingReceived: Date.now(),
                clientId: clientId
              } 
            }));
            break;
          
          // 添加更多消息类型处理
          default:
            logger.warn(`Unknown message type "${data.type}" from client ${clientId}`);
        }
      } catch (error) {
        logger.error(`Error processing message from ${clientId}: ${error}`);
        // 尝试发送错误响应
        try {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Failed to process message',
            error: (error as Error).message,
            timestamp: Date.now() 
          }));
        } catch (sendError) {
          logger.error(`Failed to send error response to ${clientId}: ${sendError}`);
        }
      }
    });

    // 处理客户端断开连接
    ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString() || 'No reason provided';
      logger.info(`Client disconnected: ${clientId}, code: ${code}, reason: ${reasonStr}`);
      clients.delete(clientId);
      logger.debug(`Remaining connected clients: ${clients.size}`);
    });

    // 处理连接错误
    ws.on('error', (error) => {
      logger.error(`WebSocket error for client ${clientId}: ${error}`);
      // 尝试关闭连接
      try {
        ws.close(1011, 'Internal server error');
      } catch (closeError) {
        logger.error(`Failed to close connection for ${clientId} after error: ${closeError}`);
      }
    });
  });

  // 处理服务器错误
  wss.on('error', (error) => {
    logger.error(`WebSocket server error: ${error.stack || error.toString()}`);
  });

  // 处理服务器关闭
  wss.on('close', () => {
    logger.info('WebSocket server closed');
    // 清理所有客户端连接
    clients.clear();
  });

  return wss;
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcastMessage(message: any): void {
  const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
  logger.info(`Broadcasting message to ${clients.size} clients: ${messageStr}`);
  
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
      logger.debug(`Skipped client ${id} for broadcast (not open, state: ${client.readyState})`);
      failCount++;
    }
  });
  
  logger.info(`Broadcast results: ${successCount} successful, ${failCount} failed`);
}

/**
 * Send a message to a specific client
 */
export function sendToClient(clientId: string, message: any): boolean {
  const client = clients.get(clientId);
  const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
  
  if (!client) {
    logger.warn(`Cannot send message to client ${clientId}: client not found`);
    return false;
  }
  
  if (client.readyState !== WebSocket.OPEN) {
    logger.warn(`Cannot send message to client ${clientId}: connection not open (state: ${client.readyState})`);
    return false;
  }
  
  try {
    logger.debug(`Sending message to client ${clientId}: ${messageStr}`);
    client.send(messageStr);
    return true;
  } catch (error) {
    logger.error(`Error sending message to client ${clientId}: ${error}`);
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