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
      console.log('WebSocket connection already exists');
      return;
    }

    this.connectionStartTime = Date.now();
    console.log(`Connecting to WebSocket server: ${config.api.wsUrl}`);

    try {
      this.updateStatus('connecting');
      this.socket = new WebSocket(config.api.wsUrl);

      this.socket.onopen = this.handleOpen.bind(this);
      this.socket.onmessage = this.handleMessage.bind(this);
      this.socket.onclose = this.handleClose.bind(this);
      this.socket.onerror = this.handleError.bind(this);
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      this.updateStatus('error');
      this.scheduleReconnect();
    }
  }

  /**
   * Send a message to the server
   */
  public send(type: string, payload?: any): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket is not connected. Cannot send message.');
      return false;
    }

    const message: WebSocketMessage = {
      type,
      payload,
      timestamp: Date.now()
    };

    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  /**
   * Close the WebSocket connection
   */
  public disconnect(): void {
    console.log('Disconnecting WebSocket');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.socket) {
      try {
        this.socket.close(1000, 'Client disconnected');
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
    }

    this.messageHandlers.get(type)!.add(handler);

    // Return a function to unsubscribe
    return () => {
      const handlers = this.messageHandlers.get(type);
      if (handlers) {
        handlers.delete(handler);
        
        if (handlers.size === 0) {
          this.messageHandlers.delete(type);
        }
      }
    };
  }

  /**
   * Register a handler for connection status changes
   */
  public onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusChangeHandlers.add(handler);

    // Immediately call the handler with current status
    handler(this.status);

    // Return a function to unsubscribe
    return () => {
      this.statusChangeHandlers.delete(handler);
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
    this.send('ping');
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen(event: Event): void {
    console.log('WebSocket connected');
    
    this.updateStatus('connected');
    this.retryCount = 0;

    // Start a ping interval to keep the connection alive
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    this.pingInterval = setInterval(() => {
      this.ping();
    }, 30000);
  }

  /**
   * Handle WebSocket message event
   */
  private handleMessage(event: MessageEvent): void {
    this.lastMessageTime = Date.now();
    
    try {
      const message = JSON.parse(event.data) as WebSocketMessage;
      
      // 如果是连接消息，存储clientId
      if (message.type === 'connected' && message.clientId) {
        this.clientId = message.clientId;
      }
      
      // First, call handlers for the specific message type
      const typeHandlers = this.messageHandlers.get(message.type);
      if (typeHandlers) {
        typeHandlers.forEach(handler => handler(message));
      }
      
      // Then, call handlers for 'all' message types
      const allHandlers = this.messageHandlers.get('*');
      if (allHandlers) {
        allHandlers.forEach(handler => handler(message));
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleClose(event: CloseEvent): void {
    console.log(`WebSocket closed: code=${event.code}, reason="${event.reason || 'No reason'}", wasClean=${event.wasClean}`);
    
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
    console.error('WebSocket error:', {
      url: this.socket?.url,
      readyState: this.getReadyStateText()
    });
    
    this.updateStatus('error');
  }

  /**
   * Update the connection status and notify handlers
   */
  private updateStatus(status: WebSocketConnectionStatus): void {
    if (this.status !== status) {
      console.log(`WebSocket status changed: ${this.status} -> ${status}`);
      this.status = status;
      this.statusChangeHandlers.forEach(handler => handler(status));
    }
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
      console.log(`Scheduling reconnect in ${delay}ms (attempt ${this.retryCount}/${this.maxRetryCount})`);
      
      this.reconnectTimer = setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error(`Max reconnection attempts (${this.maxRetryCount}) reached`);
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