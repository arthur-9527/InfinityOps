import config from '../config';

export type WebSocketMessage = {
  type: string;
  payload?: any;
  timestamp?: number;
  clientId?: string;
  message?: string;
};

export type WebSocketConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

type MessageHandler = (message: WebSocketMessage) => void;
type StatusChangeHandler = (status: WebSocketConnectionStatus) => void;

class WebSocketService {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private statusChangeHandlers: Set<StatusChangeHandler> = new Set();
  private status: WebSocketConnectionStatus = 'disconnected';
  private retryCount = 0;
  private maxRetryCount = 5;
  private retryInterval = 3000; // 3 seconds
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private connectionStartTime: number = 0;
  private lastMessageTime: number = 0;
  private clientId: string | null = null;

  /**
   * Initialize and connect to the WebSocket server
   */
  public connect(): void {
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
      console.log('WebSocket connection already exists', {
        readyState: this.getReadyStateText(),
        url: this.socket.url
      });
      return;
    }

    // 记录连接开始时间
    this.connectionStartTime = Date.now();
    console.log(`WebSocket connecting to ${config.api.wsUrl}...`, {
      retryCount: this.retryCount,
      maxRetries: this.maxRetryCount
    });

    try {
      this.updateStatus('connecting');
      this.socket = new WebSocket(config.api.wsUrl);

      // 绑定事件处理函数
      this.socket.onopen = this.handleOpen.bind(this);
      this.socket.onmessage = this.handleMessage.bind(this);
      this.socket.onclose = this.handleClose.bind(this);
      this.socket.onerror = this.handleError.bind(this);

      // 添加额外的调试信息
      console.log('WebSocket object created', {
        url: this.socket.url,
        protocol: this.socket.protocol,
        readyState: this.getReadyStateText()
      });
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error, {
        wsUrl: config.api.wsUrl,
        timestamp: new Date().toISOString()
      });
      this.updateStatus('error');
      this.scheduleReconnect();
    }
  }

  /**
   * Send a message to the server
   */
  public send(type: string, payload?: any): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected. Cannot send message.', {
        type,
        readyState: this.getReadyStateText(),
        clientId: this.clientId
      });
      return false;
    }

    const message: WebSocketMessage = {
      type,
      payload,
      timestamp: Date.now()
    };

    try {
      const messageStr = JSON.stringify(message);
      console.log(`Sending WebSocket message: ${messageStr}`, {
        readyState: this.getReadyStateText(),
        clientId: this.clientId
      });
      
      this.socket.send(messageStr);
      return true;
    } catch (error) {
      console.error('Error sending message:', error, {
        type,
        payload,
        readyState: this.getReadyStateText(),
        clientId: this.clientId
      });
      return false;
    }
  }

  /**
   * Close the WebSocket connection
   */
  public disconnect(): void {
    console.log('Disconnecting WebSocket...', {
      readyState: this.getReadyStateText(),
      clientId: this.clientId,
      connectedDuration: this.connectionStartTime ? `${(Date.now() - this.connectionStartTime) / 1000}s` : 'N/A'
    });

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
      console.log('Cleared reconnect timer');
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      console.log('Cleared ping interval');
    }

    if (this.socket) {
      try {
        this.socket.close(1000, 'Client disconnected');
        console.log('WebSocket close initiated');
      } catch (error) {
        console.error('Error closing WebSocket:', error);
      }
      this.socket = null;
    }

    this.updateStatus('disconnected');
    this.clientId = null;
  }

  /**
   * Register a handler for a specific message type
   */
  public onMessage(type: string, handler: MessageHandler): () => void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
      console.log(`Created new handler set for message type: ${type}`);
    }

    this.messageHandlers.get(type)!.add(handler);
    console.log(`Registered handler for message type: ${type}`, {
      handlerCount: this.messageHandlers.get(type)!.size
    });

    // Return a function to unsubscribe
    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.delete(handler);
        console.log(`Unregistered handler for message type: ${type}`, {
          handlerCount: handlers.size
        });
        
        if (handlers.size === 0) {
          this.messageHandlers.delete(type);
          console.log(`Removed empty handler set for message type: ${type}`);
        }
      }
    };
  }

  /**
   * Register a handler for connection status changes
   */
  public onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusChangeHandlers.add(handler);
    console.log('Registered status change handler', {
      handlerCount: this.statusChangeHandlers.size
    });

    // Immediately call the handler with current status
    handler(this.status);

    // Return a function to unsubscribe
    return () => {
      this.statusChangeHandlers.delete(handler);
      console.log('Unregistered status change handler', {
        handlerCount: this.statusChangeHandlers.size
      });
    };
  }

  /**
   * Get the current connection status
   */
  public getStatus(): WebSocketConnectionStatus {
    return this.status;
  }

  /**
   * Get the connection details
   */
  public getConnectionInfo(): any {
    return {
      status: this.status,
      readyState: this.getReadyStateText(),
      clientId: this.clientId,
      retryCount: this.retryCount,
      connectedDuration: this.connectionStartTime && this.status === 'connected' 
        ? `${Math.floor((Date.now() - this.connectionStartTime) / 1000)}s` 
        : 'N/A',
      lastMessageTime: this.lastMessageTime 
        ? new Date(this.lastMessageTime).toISOString()
        : 'Never'
    };
  }

  /**
   * Send a ping to the server to keep the connection alive
   */
  public ping(): void {
    console.log('Sending ping to server...', {
      clientId: this.clientId,
      readyState: this.getReadyStateText()
    });
    this.send('ping');
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(event: Event): void {
    const connectionTime = Date.now() - this.connectionStartTime;
    console.log(`WebSocket connected in ${connectionTime}ms`, {
      event: event.type,
      timestamp: new Date().toISOString(),
      readyState: this.getReadyStateText()
    });
    
    this.updateStatus('connected');
    this.retryCount = 0;

    // Start a ping interval to keep the connection alive
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    this.pingInterval = setInterval(() => {
      this.ping();
    }, 30000);
    
    console.log('Started ping interval (30s)');
  }

  /**
   * Handle WebSocket message event
   */
  private handleMessage(event: MessageEvent): void {
    this.lastMessageTime = Date.now();
    
    try {
      console.log(`Raw WebSocket message received: ${event.data}`);
      
      const message = JSON.parse(event.data) as WebSocketMessage;
      
      // 如果是连接消息，存储clientId
      if (message.type === 'connected' && message.clientId) {
        this.clientId = message.clientId;
        console.log(`Received client ID: ${this.clientId}`);
      }
      
      console.log(`Processed WebSocket message: type=${message.type}`, {
        payload: message.payload,
        timestamp: message.timestamp,
        clientId: this.clientId
      });
      
      // First, call handlers for the specific message type
      const typeHandlers = this.messageHandlers.get(message.type);
      if (typeHandlers) {
        console.log(`Calling ${typeHandlers.size} handlers for message type: ${message.type}`);
        typeHandlers.forEach(handler => handler(message));
      } else {
        console.log(`No handlers registered for message type: ${message.type}`);
      }
      
      // Then, call handlers for 'all' message types
      const allHandlers = this.messageHandlers.get('*');
      if (allHandlers) {
        console.log(`Calling ${allHandlers.size} wildcard handlers`);
        allHandlers.forEach(handler => handler(message));
      }
    } catch (error) {
      console.error('Error parsing message:', error, {
        data: event.data,
        clientId: this.clientId
      });
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    const connectionDuration = this.connectionStartTime 
      ? `${Math.floor((Date.now() - this.connectionStartTime) / 1000)}s` 
      : 'unknown';
      
    console.log(`WebSocket closed: code=${event.code}, reason="${event.reason || 'No reason provided'}", wasClean=${event.wasClean}`, {
      connectionDuration,
      clientId: this.clientId,
      retryCount: this.retryCount
    });
    
    // 清理 ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    this.updateStatus('disconnected');
    this.scheduleReconnect();
  }

  /**
   * Handle WebSocket error event
   */
  private handleError(event: Event): void {
    console.error('WebSocket error:', event, {
      readyState: this.getReadyStateText(),
      clientId: this.clientId,
      url: this.socket?.url,
      browser: navigator.userAgent,
      timestamp: new Date().toISOString()
    });
    
    // 获取更多关于错误的信息
    const errorDetails = {
      type: event.type,
      isTrusted: event.isTrusted,
      timeStamp: event.timeStamp,
      // 尝试获取更多关于错误的上下文
      socketState: this.socket ? {
        url: this.socket.url,
        protocol: this.socket.protocol,
        readyState: this.getReadyStateText(),
        bufferedAmount: this.socket.bufferedAmount
      } : 'No socket',
      connectionAttempt: {
        retryCount: this.retryCount,
        sinceStart: this.connectionStartTime ? `${Date.now() - this.connectionStartTime}ms` : 'N/A'
      }
    };
    
    console.error('WebSocket error details:', errorDetails);
    
    this.updateStatus('error');
  }

  /**
   * Update the connection status and notify handlers
   */
  private updateStatus(status: WebSocketConnectionStatus): void {
    console.log(`WebSocket status changed: ${this.status} -> ${status}`, {
      readyState: this.getReadyStateText(),
      clientId: this.clientId,
      handlers: this.statusChangeHandlers.size
    });
    
    this.status = status;
    this.statusChangeHandlers.forEach(handler => handler(status));
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.retryCount < this.maxRetryCount) {
      this.retryCount++;
      const delay = this.retryInterval * Math.pow(1.5, this.retryCount - 1);
      console.log(`Scheduling WebSocket reconnect in ${delay}ms (attempt ${this.retryCount}/${this.maxRetryCount})`, {
        backoffFactor: Math.pow(1.5, this.retryCount - 1),
        baseInterval: this.retryInterval
      });
      
      this.reconnectTimer = setTimeout(() => {
        console.log(`Attempting reconnect #${this.retryCount}...`);
        this.connect();
      }, delay);
    } else {
      console.error(`Max WebSocket reconnection attempts (${this.maxRetryCount}) reached`);
    }
  }

  /**
   * Get a text representation of the current ready state
   */
  private getReadyStateText(): string {
    if (!this.socket) return 'NO_SOCKET';
    
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return 'CONNECTING';
      case WebSocket.OPEN:
        return 'OPEN';
      case WebSocket.CLOSING:
        return 'CLOSING';
      case WebSocket.CLOSED:
        return 'CLOSED';
      default:
        return `UNKNOWN(${this.socket.readyState})`;
    }
  }
}

// Export a singleton instance
export const webSocketService = new WebSocketService(); 