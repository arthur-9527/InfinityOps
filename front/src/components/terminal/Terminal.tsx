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
  const [ctrlCPressed, setCtrlCPressed] = useState<boolean>(false);
  const ctrlCTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [inInteractiveMode, setInInteractiveMode] = useState<boolean>(false);
  const [currentInteractiveCommand, setCurrentInteractiveCommand] = useState<string>('');
  const [terminalState, setTerminalState] = useState<'normal' | 'interactive' | 'config'>('normal');
  const lastKeyRef = useRef<{key: string, time: number} | null>(null);
  
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
        // 某些命令响应可能不需要显示提示符
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
        xtermRef.current.write('Password: ');
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
        // Update terminal service with SSH connection info and use display hostname
        terminalService.setSshConnection(
          true, 
          message.payload.username, 
          message.payload.displayHost || message.payload.host // 优先使用displayHost
        );
        
        // 使用displayHost显示连接成功消息
        const displayHost = message.payload.displayHost || message.payload.host;
        xtermRef.current.write(`\r\nConnected to ${message.payload.username}@${displayHost}\r\n`);
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
    
    // 处理交互式命令开始消息
    const unsubInteractiveCommandStarted = webSocketService.onMessage('interactiveCommandStarted', (message) => {
      if (message.payload && message.payload.command) {
        console.log('交互式命令开始:', message.payload.command);
        setInInteractiveMode(true);
        setCurrentInteractiveCommand(message.payload.command);
        // 清空输入缓冲区以避免干扰交互式程序
        setInputBuffer('');
      }
    });
    
    // Handle SSH disconnection
    const unsubSshDisconnected = webSocketService.onMessage('sshDisconnected', (message) => {
      if (xtermRef.current) {
        setSshConnected(false);
        // 退出交互模式
        setInInteractiveMode(false);
        setCurrentInteractiveCommand('');
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
    
    // Add welcome message and SSH connection prompt
    if (xtermRef.current && !initialCommand) {
      setTimeout(() => {
        if (!sshConnected) {
          const welcomeMsg = "\r\nWelcome to InfinityOps Terminal\r\n\r\n";
          const connectMsg = "Please connect to a remote server using SSH.\r\nExample: ssh username@hostname\r\n\r\n";
          xtermRef.current.write(welcomeMsg + connectMsg + terminalService.getPrompt());
        }
      }, 200);
    }
    
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
      unsubInteractiveCommandStarted();
      webSocketService.disconnect();
      
      // 清除Ctrl+C定时器
      if (ctrlCTimeoutRef.current) {
        clearTimeout(ctrlCTimeoutRef.current);
        ctrlCTimeoutRef.current = null;
      }
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
  
  // Effect to update terminal when entering/exiting interactive mode
  useEffect(() => {
    if (inInteractiveMode && xtermRef.current) {
      // Ensure terminal has focus when entering interactive mode
      xtermRef.current.focus();
    }
  }, [inInteractiveMode]);
  
  // 添加终端状态变更监听
  useEffect(() => {
    const unsubTerminalStateChange = webSocketService.onMessage('terminalStateChange', (message: { payload?: { oldState: 'normal' | 'interactive' | 'config', newState: 'normal' | 'interactive' | 'config' } }) => {
      if (message.payload) {
        const { oldState, newState } = message.payload;
        setTerminalState(newState);
        console.log(`Terminal state changed: ${oldState} -> ${newState}`);
        // 更新交互模式状态
        setInInteractiveMode(newState === 'interactive');
      }
    });

    return () => {
      unsubTerminalStateChange();
    };
  }, []);
  
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
      // 无论是否已连接SSH，都允许发送ssh命令
      if (command.trim().toLowerCase().startsWith('ssh ')) {
        webSocketService.send('terminalCommand', { 
          command,
          path: terminalService.getPath(),
          timestamp: Date.now()
        });
        return true;
      }
      
      // 如果已经连接到SSH，直接发送普通命令
      if (sshConnected) {
        webSocketService.send('terminalCommand', {
          command,
          path: terminalService.getPath(),
          timestamp: Date.now()
        });
        return true;
      }
      
      // 如果未连接SSH，且命令不是SSH连接命令，显示错误
      if (xtermRef.current) {
        xtermRef.current.write('\r\nError: Not connected to SSH server.\r\nPlease connect first using: ssh username@host\r\n');
        xtermRef.current.write(terminalService.getPrompt());
      }
      return false;
    } else {
      // WebSocket未连接，无法发送任何命令
      if (xtermRef.current) {
        xtermRef.current.write('\r\nWebSocket not connected. Cannot execute commands.\r\n');
        xtermRef.current.write(terminalService.getPrompt());
      }
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
  
  // 处理用户输入
  const handleUserInput = (data: string) => {
    const term = xtermRef.current;
    if (!term) return;
    try {
      // 密码模式处理
      if (passwordMode) {
        const code = data.charCodeAt(0);
        const isEnter = code === 13; // Enter key
        const isBackspace = code === 127 || code === 8; // Backspace key
        if (isEnter) {
          // 提交密码
          term.write('\r\n');
          submitSshPassword();
          return;
        } else if (isBackspace) {
          // 处理退格键（不显示字符删除）
          if (passwordBuffer.length > 0) {
            setPasswordBuffer(prev => prev.substring(0, prev.length - 1));
          }
          return;
        } else {
          // 添加字符到密码缓冲区但不显示
          setPasswordBuffer(prev => prev + data);
          return;
        }
      }
      // SSH连接模式 - 所有输入直接发送到SSH
      if (sshConnected) {
        // 特殊键处理
        const code = data.charCodeAt(0);
        // 获取当前时间用于防重复
        const now = Date.now();
        const lastKey = lastKeyRef.current;
        // 对于相同的按键，时间间隔过短可能是重复，跳过
        if (lastKey && lastKey.key === data && now - lastKey.time < 100) {
          console.log('忽略可能重复的按键:', data);
          return;
        }
        // 更新最后按键记录
        lastKeyRef.current = { key: data, time: now };
        // 直接发送输入到SSH服务器（包括Ctrl+C等所有按键）
        sendKeyToSSH(data);
        return;
      }
      // 非SSH模式下的本地处理逻辑
      const code = data.charCodeAt(0);
      const isEnter = code === 13; // Enter key
      const isBackspace = code === 127 || code === 8; // Backspace key
      const isUpArrow = data === '\x1b[A';
      const isDownArrow = data === '\x1b[B';
      if (isEnter) {
        // Process the command
        term.write('\r\n');
        if (inputBuffer.trim().length > 0) {
          // Add command to history
          setCommandHistory(prev => [...prev, inputBuffer]);
          setHistoryIndex(-1);
          // 发送命令到服务器，检查是否是SSH命令
          if (inputBuffer.trim().toLowerCase().startsWith('ssh ')) {
            // 显示连接中消息
            term.write(`Connecting... ${inputBuffer}\r\n`);
            sendCommandToServer(inputBuffer);
          } else {
            // 非SSH命令提示
            term.write('\r\nError: Not connected to SSH server.\r\nPlease connect first using: ssh username@host\r\n');
            term.write(terminalService.getPrompt());
          }
          // 重置输入缓冲区
          setInputBuffer('');
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
        // Normal character input - 允许任何输入，包括ssh命令和Ctrl+C
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
  
  // 直接发送按键到SSH服务器
  const sendKeyToSSH = (key: string) => {
    if (!sshConnected || !webSocketService.isConnected()) {
      return false;
    }
    
    try {
      // 发送按键数据到服务器
      webSocketService.send('terminalCommand', {
        command: key,
        path: terminalService.getPath(),
        timestamp: Date.now(),
        isRawInput: true  // 标记这是原始输入，不需要加换行符
      });
      return true;
    } catch (error) {
      console.error('发送按键到SSH服务器失败:', error);
      return false;
    }
  };
  
  // Terminal options to match the screenshot
  const terminalOptions = {
    fontFamily: 'Menlo, Monaco, Consolas, monospace',
    fontSize: 14,
    cursorBlink: true,
    cursorStyle: 'block' as 'block', // Explicitly typed as valid value
    scrollback: 1000,
    rows: 34, // 减少一行，为底部留出空间
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
  
  // 添加状态指示器样式
  const getStateIndicatorStyle = () => {
    const stateColors: Record<'normal' | 'interactive' | 'config', string> = {
      normal: '#4CAF50', // 绿色
      interactive: '#FFC107', // 黄色
      config: '#00BCD4' // 青色
    };
    return {
      position: 'absolute' as const,
      top: '5px',
      right: '10px',
      padding: '2px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      color: '#fff',
      backgroundColor: stateColors[terminalState],
      zIndex: 1000
    };
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
        position: 'relative',
        paddingBottom: '10px' // 添加底部内边距
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
      <div style={getStateIndicatorStyle()}>
        {terminalState.toUpperCase()}
      </div>
      <div style={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        paddingBottom: '8px' // 确保XTerm有底部空间
      }}>
        <XTerm
          ref={handleTerminalRef}
          options={terminalOptions}
          addons={[new FitAddon(), new WebLinksAddon()]}
          onData={handleUserInput}
        />
      </div>
    </div>
  );
};

export default Terminal; 