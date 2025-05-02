import React, { useEffect, useState } from 'react';
import { webSocketService, WebSocketConnectionStatus } from '../services/websocket.service';

const statusColors = {
  connecting: '#ffa500', // Orange
  connected: '#00cc00',  // Green
  disconnected: '#999999', // Gray
  error: '#ff0000' // Red
};

const statusMessages = {
  connecting: 'Connecting to server...',
  connected: 'Connected to server',
  disconnected: 'Disconnected from server',
  error: 'Connection error'
};

const WebSocketStatus: React.FC = () => {
  const [status, setStatus] = useState<WebSocketConnectionStatus>(webSocketService.getStatus());
  const [lastMessage, setLastMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [connectionInfo, setConnectionInfo] = useState<any>(null);
  const messagesLimit = 10;

  // 更新连接信息的函数
  const updateConnectionInfo = () => {
    setConnectionInfo(webSocketService.getConnectionInfo());
  };

  useEffect(() => {
    console.log('WebSocketStatus component mounted');
    
    // 连接到WebSocket服务器
    webSocketService.connect();
    updateConnectionInfo();

    // 订阅状态变化
    const unsubscribeStatus = webSocketService.onStatusChange((newStatus) => {
      console.log(`WebSocketStatus: Status changed to ${newStatus}`);
      setStatus(newStatus);
      updateConnectionInfo();
    });

    // 订阅所有消息
    const unsubscribeMessage = webSocketService.onMessage('*', (message) => {
      const messageStr = JSON.stringify(message);
      console.log(`WebSocketStatus: Received message: ${messageStr}`);
      
      setLastMessage(messageStr);
      setMessages(prev => {
        const newMessages = [...prev, messageStr];
        // 保持消息数量有限
        return newMessages.slice(-messagesLimit);
      });
      
      updateConnectionInfo();
    });

    // 定时更新连接信息
    const infoInterval = setInterval(updateConnectionInfo, 2000);

    // 组件卸载时清理
    return () => {
      console.log('WebSocketStatus component unmounting');
      unsubscribeStatus();
      unsubscribeMessage();
      clearInterval(infoInterval);
      webSocketService.disconnect();
    };
  }, []);

  const handleReconnect = () => {
    console.log('Manually reconnecting to WebSocket server...');
    webSocketService.connect();
  };

  const handleSendPing = () => {
    console.log('Manually sending ping...');
    webSocketService.send('ping');
  };

  const handleDisconnect = () => {
    console.log('Manually disconnecting from WebSocket server...');
    webSocketService.disconnect();
  };

  const toggleDetails = () => {
    setShowDetails(!showDetails);
  };

  return (
    <div className="websocket-status" style={{ 
      padding: '10px', 
      border: '1px solid #ccc', 
      borderRadius: '4px',
      marginBottom: '20px',
      backgroundColor: '#f8f9fa'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div 
            style={{ 
              width: '10px', 
              height: '10px', 
              borderRadius: '50%', 
              backgroundColor: statusColors[status],
              marginRight: '10px'
            }} 
          />
          <span style={{ fontWeight: 'bold' }}>{statusMessages[status]}</span>
        </div>
        
        <button
          onClick={toggleDetails}
          style={{
            padding: '2px 8px',
            backgroundColor: '#6c757d',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      
      <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
        {status !== 'connected' && (
          <button 
            onClick={handleReconnect}
            style={{ 
              padding: '5px 10px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              flex: '1'
            }}
          >
            Connect
          </button>
        )}
        
        {status === 'connected' && (
          <>
            <button 
              onClick={handleSendPing}
              style={{ 
                padding: '5px 10px',
                backgroundColor: '#28a745',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                flex: '1'
              }}
            >
              Send Ping
            </button>
            
            <button 
              onClick={handleDisconnect}
              style={{ 
                padding: '5px 10px',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                flex: '1'
              }}
            >
              Disconnect
            </button>
          </>
        )}
      </div>
      
      {showDetails && connectionInfo && (
        <div style={{ marginBottom: '10px' }}>
          <h4 style={{ fontSize: '14px', marginBottom: '5px' }}>Connection Info:</h4>
          <pre style={{ 
            backgroundColor: '#e9ecef', 
            padding: '8px', 
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '12px',
            margin: '0',
            overflow: 'auto'
          }}>
            {JSON.stringify(connectionInfo, null, 2)}
          </pre>
        </div>
      )}
      
      {showDetails && messages.length > 0 && (
        <div>
          <h4 style={{ fontSize: '14px', marginBottom: '5px' }}>Message History:</h4>
          <div style={{ 
            maxHeight: '150px', 
            overflowY: 'auto',
            backgroundColor: '#e9ecef',
            border: '1px solid #ddd',
            borderRadius: '4px',
            padding: '5px'
          }}>
            {messages.map((msg, index) => (
              <pre key={index} style={{ 
                margin: '5px 0',
                padding: '5px',
                backgroundColor: '#f8f9fa',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '12px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all'
              }}>
                {msg}
              </pre>
            ))}
          </div>
        </div>
      )}
      
      {lastMessage && !showDetails && (
        <div>
          <strong>Last message:</strong>
          <pre style={{ 
            backgroundColor: '#f8f9fa', 
            padding: '5px', 
            border: '1px solid #ddd',
            borderRadius: '4px',
            overflow: 'auto',
            fontSize: '12px',
            margin: '5px 0 0 0'
          }}>
            {lastMessage}
          </pre>
        </div>
      )}
    </div>
  );
};

export default WebSocketStatus; 