import React, { useEffect, useRef, useState } from 'react';
import { XTerm } from '@pablo-lion/xterm-react';
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { terminalService } from '../../services/terminal.service';
import { webSocketService } from '../../services/websocket.service';

interface TerminalProps {
  initialCommand?: string;
}

const Terminal: React.FC<TerminalProps> = ({ initialCommand }) => {
  const xtermRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [inputBuffer, setInputBuffer] = useState<string>('');
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [lastCharLen, setLastCharLen] = useState<number>(1); // 跟踪最后输入字符的长度
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [sshConnected, setSshConnected] = useState<boolean>(false);
  const [awaitingPassword, setAwaitingPassword] = useState<boolean>(false);
  const [sshConnectionDetails, setSshConnectionDetails] = useState<any>(null);
  const [passwordBuffer, setPasswordBuffer] = useState<string>('');
  const [passwordMode, setPasswordMode] = useState<boolean>(false);
  
  // Main effect for setup and websocket connections
  useEffect(() => {
    // 连接到WebSocket服务器
    webSocketService.connect();

    // 监听WebSocket状态变化
    const unsubscribeStatus = webSocketService.onStatusChange((status) => {
      setIsConnected(status === 'connected');
    });

    // 监听从服务器返回的消息
    const unsubscribeMessage = webSocketService.onMessage('terminalResponse', (message) => {
      if (xtermRef.current && message.payload) {
        // 在终端显示服务器返回的响应
        xtermRef.current.write(`${message.payload.output}\r\n`);
        
        // 只有当明确不显示提示符时才不显示
        // 这允许AI在转发命令到SSH之前显示解释，而不显示提示符
        if (message.payload.showPrompt !== false) {
          // 显示新的提示符
          xtermRef.current.write(terminalService.getPrompt());
        }
      }
    });
    
    // Handle SSH connection request
    const unsubSshConnReq = webSocketService.onMessage('sshConnectionRequest', (message) => {
      if (xtermRef.current && message.payload) {
        setAwaitingPassword(true);
        setSshConnectionDetails(message.payload);
        xtermRef.current.write('\r\nPassword: ');
        setPasswordMode(true);
        setPasswordBuffer('');
      }
    });
    
    // Handle SSH connection established
    const unsubSshConnected = webSocketService.onMessage('sshConnected', (message) => {
      if (xtermRef.current && message.payload) {
        setSshConnected(true);
        setAwaitingPassword(false);
        setPasswordMode(false);
        // Update terminal service with SSH connection info
        terminalService.setSshConnection(
          true, 
          message.payload.username, 
          message.payload.host
        );
        xtermRef.current.write(`\r\nConnected to ${message.payload.username}@${message.payload.host}\r\n`);
      }
    });
    
    // Handle SSH data received
    const unsubSshData = webSocketService.onMessage('sshData', (message) => {
      if (xtermRef.current && message.payload && message.payload.data) {
        // Write data directly to terminal
        xtermRef.current.write(message.payload.data);
      }
    });
    
    // Handle command sent - nothing to do but log
    const unsubCommandSent = webSocketService.onMessage('commandSent', (message) => {
      console.log('Command sent to SSH server:', message.payload?.command);
    });
    
    // Handle SSH disconnection
    const unsubSshDisconnected = webSocketService.onMessage('sshDisconnected', (message) => {
      if (xtermRef.current) {
        setSshConnected(false);
        // Update terminal service
        terminalService.setSshConnection(false);
        xtermRef.current.write('\r\nSSH connection closed\r\n');
        xtermRef.current.write(terminalService.getPrompt());
      }
    });
    
    // Attempt to fit the terminal whenever the window resizes
    const handleResize = () => {
      if (xtermRef.current) {
        try {
          xtermRef.current.fit?.();
          
          // If SSH connected, send terminal resize info
          if (sshConnected) {
            const { rows, cols } = xtermRef.current.terminal;
            webSocketService.send('sshResize', { rows, cols });
          }
        } catch (err) {
          console.error('Error fitting terminal:', err);
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Focus the terminal on mount
    setTimeout(() => {
      if (xtermRef.current) {
        xtermRef.current.focus();
      }
    }, 150);
    
    // If there's an initial command, execute it
    if (initialCommand && xtermRef.current) {
      try {
        // Just print the initial command text as static content
        // Make sure to convert newlines properly
        const formattedCommand = initialCommand.replace(/\\n/g, '\n\r').replace(/\\r/g, '\r');
        xtermRef.current.write(formattedCommand);
      } catch (err) {
        console.error('Error writing to terminal:', err);
        setError('Failed to write to terminal');
      }
    }
    
    // Initial fit
    setTimeout(() => {
      handleResize();
    }, 100);
    
    // Hide scrollbar by targeting the xterm-viewport element after terminal is initialized
    setTimeout(() => {
      const viewport = document.querySelector('.xterm-viewport') as HTMLElement;
      if (viewport) {
        // viewport.style.scrollbarWidth = 'none'; // Firefox
        // Apply other styles through the stylesheet instead
        
        // For WebKit browsers
        const styleSheet = document.createElement('style');
        styleSheet.textContent = `
          .xterm-viewport::-webkit-scrollbar {
            width: 0 !important;
            height: 0 !important;
            display: none !important;
          }
          .xterm-viewport {
            -ms-overflow-style: none !important; /* IE and Edge */
            overflow: -moz-scrollbars-none !important; /* Old Firefox */
            scrollbar-width: none !important; /* Firefox */
          }
          
          /* Ensure terminal cursor renders correctly */
          .xterm-cursor-layer {
            visibility: visible !important;
          }
          
          /* Additional resets to prevent white borders and scrollbars */
          .xterm-screen, .xterm {
            padding: 0 !important;
            margin: 0 !important;
            overflow: hidden !important;
          }
        `;
        document.head.appendChild(styleSheet);
        
        // Additional fixes to ensure viewport doesn't show scrollbars
        viewport.style.overflow = 'hidden';
      }
    }, 200);
    
    // Set initial SSH status from terminal service on component mount
    setSshConnected(terminalService.isSshConnected());
    
    return () => {
      window.removeEventListener('resize', handleResize);
      unsubscribeStatus();
      unsubscribeMessage();
      unsubSshConnReq();
      unsubSshConnected();
      unsubSshData();
      unsubSshDisconnected();
      unsubCommandSent();
      webSocketService.disconnect();
    };
  }, [initialCommand]);
  
  // Effect for terminal resize when SSH connection status changes
  useEffect(() => {
    if (sshConnected && xtermRef.current) {
      // Send initial terminal size after connection
      setTimeout(() => {
        try {
          const { rows, cols } = xtermRef.current.terminal;
          webSocketService.send('sshResize', { rows, cols });
        } catch (err) {
          console.error('Error sending terminal resize info:', err);
        }
      }, 100);
    }
  }, [sshConnected]);
  
  const handleTerminalRef = (term: any) => {
    xtermRef.current = term;
  };
  
  // 辅助函数：检测字符是否是多字节字符（如中文）
  const isMultibyteChar = (char: string): boolean => {
    return char.charCodeAt(0) > 127 || char.length > 1;
  };
  
  // 辅助函数：获取字符的可视宽度
  const getCharWidth = (char: string): number => {
    if (!char) return 0;
    if (isMultibyteChar(char)) {
      return 2; // 中文等宽字符通常占用两个显示单元
    }
    return 1;
  };
  
  // 辅助函数：清除当前输入
  const clearCurrentInput = (input: string): void => {
    if (!xtermRef.current) return;
    
    // 从后向前逐个字符清除
    for (let i = input.length - 1; i >= 0; i--) {
      const char = input.charAt(i);
      const width = getCharWidth(char);
      for (let j = 0; j < width; j++) {
        xtermRef.current.write('\b \b');
      }
    }
  };

  // 发送命令到后端服务器
  const sendCommandToServer = (command: string) => {
    if (isConnected) {
      webSocketService.send('terminalCommand', { 
        command,
        path: terminalService.getPath(),
        timestamp: Date.now()
      });
      return true;
    } else {
      console.warn('WebSocket not connected. Using local command processing.');
      return false;
    }
  };
  
  // Complete SSH password authentication
  const submitSshPassword = () => {
    if (sshConnectionDetails && passwordBuffer) {
      webSocketService.send('sshPasswordAuth', {
        ...sshConnectionDetails,
        password: passwordBuffer
      });
      setPasswordMode(false);
      setPasswordBuffer('');
    }
  };
  
  const handleUserInput = (data: string) => {
    const term = xtermRef.current;
    if (!term) return;
    
    try {
      // Handle special key presses
      const code = data.charCodeAt(0);
      const isEnter = code === 13; // Enter key
      const isBackspace = code === 127 || code === 8; // Backspace key
      const isUpArrow = data === '\x1b[A';
      const isDownArrow = data === '\x1b[B';
      
      // Special handling for password mode
      if (passwordMode) {
        if (isEnter) {
          // Submit password
          term.write('\r\n');
          submitSshPassword();
          return;
        } else if (isBackspace) {
          // Handle backspace in password mode (don't show character deletion)
          if (passwordBuffer.length > 0) {
            setPasswordBuffer(prev => prev.substring(0, prev.length - 1));
          }
          return;
        } else if (!isUpArrow && !isDownArrow) {
          // Add character to password buffer but don't display
          setPasswordBuffer(prev => prev + data);
          return;
        }
      }
      
      if (isEnter) {
        // Process the command
        term.write('\r\n');
        
        if (inputBuffer.trim().length > 0) {
          // Add command to history
          setCommandHistory(prev => [...prev, inputBuffer]);
          setHistoryIndex(-1);
          
          // Check if we're connected to SSH
          if (!sshConnected && !inputBuffer.trim().toLowerCase().startsWith('ssh ')) {
            // Not connected to SSH and not an SSH connect command
            term.write('Error: Not connected to remote server. Please connect first using: ssh username@host\r\n');
            term.write(terminalService.getPrompt());
            setInputBuffer('');
            return;
          }
          
          // 尝试通过WebSocket发送命令
          const sentToServer = sendCommandToServer(inputBuffer);

          // 如果WebSocket未连接或发送失败，使用本地处理
          if (!sentToServer) {
            // 本地处理命令
            const output = terminalService.processCommand(inputBuffer);
            if (output) {
              term.write(output + '\r\n');
            }
            
            // 立即显示新的提示符
            term.write(terminalService.getPrompt());
          }
          // WebSocket连接时，不立即显示提示符，等待服务器响应后显示
        } else {
          // 空命令，直接显示提示符
          term.write(terminalService.getPrompt());
        }
        
        // 重置输入缓冲区
        setInputBuffer('');
        setLastCharLen(1); // 重置字符长度
      } else if (isBackspace) {
        // Handle backspace: remove the last character from buffer and terminal
        if (inputBuffer.length > 0) {
          // 获取最后一个字符
          const lastChar = inputBuffer[inputBuffer.length - 1];
          const charWidth = getCharWidth(lastChar);
          
          // 根据字符宽度进行相应的删除操作
          for (let i = 0; i < charWidth; i++) {
            term.write('\b \b'); // 对每个位置都执行：移动光标，擦除，再移动光标
          }
          
          // 更新输入缓冲区
          setInputBuffer(prev => prev.substring(0, prev.length - 1));
        }
      } else if (isUpArrow) {
        // Browse command history (up)
        if (commandHistory.length > 0 && historyIndex < commandHistory.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          
          // 清除当前输入
          clearCurrentInput(inputBuffer);
          
          // Write historical command
          const historicalCommand = commandHistory[commandHistory.length - 1 - newIndex];
          term.write(historicalCommand);
          setInputBuffer(historicalCommand);
          
          // 设置最后一个字符的宽度
          if (historicalCommand.length > 0) {
            const lastChar = historicalCommand[historicalCommand.length - 1];
            setLastCharLen(getCharWidth(lastChar));
          }
        }
      } else if (isDownArrow) {
        // Browse command history (down)
        if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          
          // 清除当前输入
          clearCurrentInput(inputBuffer);
          
          // Write historical command
          const historicalCommand = commandHistory[commandHistory.length - 1 - newIndex];
          term.write(historicalCommand);
          setInputBuffer(historicalCommand);
          
          // 设置最后一个字符的宽度
          if (historicalCommand.length > 0) {
            const lastChar = historicalCommand[historicalCommand.length - 1];
            setLastCharLen(getCharWidth(lastChar));
          }
        } else if (historyIndex === 0) {
          // Clear input when reaching the end of history
          clearCurrentInput(inputBuffer);
          setInputBuffer('');
          setHistoryIndex(-1);
        }
      } else {
        // Normal character input
        term.write(data);
        setInputBuffer(prev => prev + data);
        
        // 更新最后一个字符的宽度
        setLastCharLen(getCharWidth(data));
      }
    } catch (err) {
      console.error('Error handling user input:', err);
      setError(`Input error: ${err}`);
    }
  };
  
  // Terminal options to match the screenshot
  const terminalOptions = {
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    fontSize: 14,
    cursorBlink: true,
    cursorStyle: 'block' as 'block', // Explicitly typed as valid value
    scrollback: 1000,
    rows: 35,
    cols: 120,
    convertEol: true, // Ensure \n is converted to \r\n
    theme: {
      background: '#1a1b26',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      cursorAccent: '#1a1b26',
      selection: 'rgba(255, 255, 255, 0.3)',
      black: '#000000',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff'
    }
  };
  
  if (error) {
    return (
      <div 
        style={{ 
          width: '100%', 
          height: '100%', 
          backgroundColor: '#1a1b26',
          color: '#ff5555',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '16px',
          fontFamily: 'monospace'
        }}
      >
        {error}
      </div>
    );
  }
  
  return (
    <div 
      ref={containerRef} 
      style={{ 
        width: '100%', 
        height: '100%', 
        backgroundColor: '#1a1b26',
        overflow: 'hidden',
        padding: '0',
        margin: '0',
        borderBottomLeftRadius: '6px',
        borderBottomRightRadius: '6px',
        position: 'relative'
      }}
      onClick={() => {
        // Focus the terminal when container is clicked
        if (xtermRef.current) {
          xtermRef.current.focus();
        }
      }}
    >
      {!isConnected && (
        <div style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          backgroundColor: '#ff5555',
          color: 'white',
          padding: '2px 6px',
          borderRadius: '4px',
          fontSize: '10px',
          zIndex: 100,
          opacity: 0.8
        }}>
          Not connected to server
        </div>
      )}
      <XTerm
        ref={handleTerminalRef}
        options={terminalOptions}
        addons={[new FitAddon(), new WebLinksAddon()]}
        onData={handleUserInput}
      />
    </div>
  );
};

export default Terminal; 