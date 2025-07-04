import React, { useEffect, useRef, useState } from 'react';
import { XTerm } from '@pablo-lion/xterm-react';
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { terminalService } from '../../services/terminal.service';
import { webSocketService } from '../../services/websocket.service';
import Logger from '../../utils/logger';


interface TerminalProps {
  initialCommand?: string;
}

interface SSHSession {
  sessionId: string;
  connected: boolean;
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
  const [awaitingConfirmation, setAwaitingConfirmation] = useState<boolean>(false);
  const [waitingForTabCompletion, setWaitingForTabCompletion] = useState<boolean>(false);
  const [sshSession, setSshSession] = useState<SSHSession | null>(null);
  const [clientId, setClientId] = useState<string>('');
  const lastTabTime = useRef<number>(0);
  
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
      if (!message || !message.payload) return;
      
      const { output, success, analysisType, showPrompt = true, awaitingConfirmation: isAwaitingConfirmation = false } = message.payload;
      
      // 更新SSH路径
      if (message.payload.path) {
        terminalService.setPath(message.payload.path);
      }
      
      // 显示终端输出
      if (output) {
        xtermRef.current.write(`${output}\r\n`);
      }
      
      // 如果在等待确认，设置等待确认状态
      if (isAwaitingConfirmation) {
        setAwaitingConfirmation(true);
        // 不显示提示符，等待用户确认
        return;
      } else if (awaitingConfirmation && analysisType === 'command_cancelled') {
        // 如果用户取消了命令，清除等待确认状态
        setAwaitingConfirmation(false);
      } else {
        // 其他情况，确保不处于等待确认状态
        setAwaitingConfirmation(false);
      }
      
      // 如果需要显示提示符，才显示
      if (showPrompt) {
        xtermRef.current.write(terminalService.getPrompt());
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
        
        // 添加调试日志
        console.log('收到SSH连接成功消息:', JSON.stringify(message.payload));
        
        // 保存SSH会话信息
        if (message.payload.sessionId) {
          console.log('设置SSH会话ID:', message.payload.sessionId);
          setSshSession({
            sessionId: message.payload.sessionId,
            connected: true
          });
        } else {
          console.warn('SSH连接成功但未收到会话ID');
        }
        
        // 保存客户端ID
        if (message.clientId) {
          console.log('设置客户端ID:', message.clientId);
          setClientId(message.clientId);
        }
        
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
    
    // Handle SSH disconnection
    const unsubSshDisconnected = webSocketService.onMessage('sshDisconnected', (message) => {
      if (xtermRef.current) {
        setSshConnected(false);
        
        // 清除SSH会话信息
        setSshSession(null);
        
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
  
  // 发送Tab键到后端服务器请求自动补全
  const sendTabCompletion = () => {
    // Throttle tab presses to prevent rapid repeated requests
    const now = Date.now();
    if (now - lastTabTime.current < 250) { // 250ms debounce
      return false;
    }
    lastTabTime.current = now;
    
    if (isConnected && sshConnected) {
      // 保存当前输入状态
      const currentBuffer = inputBuffer;
      
      // Set waiting state to prevent further tab presses
      setWaitingForTabCompletion(true);
      
      webSocketService.send('tabCompletion', {
        currentInput: currentBuffer,
        path: terminalService.getPath(),
        timestamp: now
      });
      
      // 我们需要先清空终端输入，因为SSH会先清理行
      setTimeout(() => {
        if (xtermRef.current) {
          // 清除当前输入
          clearCurrentInput(currentBuffer);
        }
      }, 50);
      
      return true;
    }
    return false;
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
      const isTab = code === 9; // Tab key
      const isCtrlC = code === 3; // Ctrl+C (ETX - End of Text)
      
      // 处理 Ctrl+C
      if (isCtrlC) {
        console.log('接收到 Ctrl+C');
        
        // 显示 ^C
        term.write('^C');
        term.write('\r\n');
        
        // 如果在确认模式下，取消确认
        if (awaitingConfirmation) {
          setAwaitingConfirmation(false);
          setInputBuffer('');
          term.write(terminalService.getPrompt());
          return;
        }
        
        // 如果在等待Tab补全，取消补全
        if (waitingForTabCompletion) {
          setWaitingForTabCompletion(false);
        }
        
        // 如果当前有输入，清空输入并显示新提示符
        if (inputBuffer.length > 0) {
          setInputBuffer('');
          term.write(terminalService.getPrompt());
          return;
        }
        
        // 如果连接到SSH，发送中断信号
        if (sshConnected && sshSession) {
          // 添加调试日志
          console.log('发送SIGINT信号，SSH会话信息:', JSON.stringify(sshSession));
          
          // 发送中断信号 (SIGINT - Ctrl+C) 到SSH服务器
          webSocketService.send('sshSignal', { 
            signal: 'SIGINT',
            sessionId: sshSession.sessionId
          });
        } else {
          // 添加调试日志
          console.log('未发送SIGINT信号，SSH连接状态:', sshConnected, '会话状态:', sshSession);
          
          // 未连接SSH或没有有效会话时，只显示新提示符
          term.write(terminalService.getPrompt());
        }
        
        return;
      }
      
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
        // Tab key should be ignored in password mode
        if (isTab) {
          return;
        }
      }
      
      // 特殊处理确认模式
      if (awaitingConfirmation) {
        // 检查是否是y或n的输入（不区分大小写）
        const lowerChar = data.toLowerCase();
        
        if (lowerChar === 'y' || lowerChar === 'n') {
          // 显示输入的字符
          term.write(data);
          // 自动换行
          term.write('\r\n');
          
          // 立即发送确认响应
          sendCommandToServer(lowerChar);
          
          // 清空输入并退出确认模式
          setInputBuffer('');
          setAwaitingConfirmation(false);
          return;
        } else if (isEnter) {
          // 如果按下回车，根据已输入的内容确认，若没有输入则默认取消
          term.write('\r\n');
          
          const input = inputBuffer.trim().toLowerCase();
          if (input === 'y' || input === 'yes') {
            sendCommandToServer('y');
          } else if (input === 'n' || input === 'no' || input === '') {
            sendCommandToServer('n');
          } else {
            // 无效输入，默认取消
            sendCommandToServer('n');
          }
          
          setInputBuffer('');
          return;
        } else if (isBackspace) {
          // 允许删除输入
          if (inputBuffer.length > 0) {
            const lastChar = inputBuffer[inputBuffer.length - 1];
            const charWidth = getCharWidth(lastChar);
            
            for (let i = 0; i < charWidth; i++) {
              term.write('\b \b');
            }
            
            setInputBuffer(prev => prev.substring(0, prev.length - 1));
          }
          return;
        } else if (/^[a-zA-Z0-9\s]$/.test(data)) {
          // 允许输入字母、数字和空格
          term.write(data);
          setInputBuffer(prev => prev + data);
          return;
        }
        
        // 忽略其他输入
        return;
      }
      
      // Handle tab key for completion
      if (isTab) {
        // Only process if we're connected to SSH and not already waiting for completion
        if (sshConnected && !waitingForTabCompletion) {
          // For SSH sessions, send the current input for tab completion
          sendTabCompletion();
        }
        return;
      }
      
      // Reset tab completion waiting state when user types anything else
      if (waitingForTabCompletion) {
        setWaitingForTabCompletion(false);
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
  
  // Effect for handling tab completion responses
  useEffect(() => {
    const unsubTabCompletion = webSocketService.onMessage('tabCompletionResponse', (message) => {
      if (xtermRef.current && message.payload) {
        const { success, completionResult, message: errorMessage } = message.payload;
        
        // 如果补全请求成功
        if (success && completionResult) {
          const { originalInput, completedInput, options, found } = completionResult;
          
          console.log('Tab补全结果:', completionResult);
          
          // 先清除当前输入
          // clearCurrentInput(inputBuffer);
          console.log("测试1");
          if (found) {
            // 如果找到了补全项
            // 只有一个补全结果
            console.log('准备显示测试文本');
            xtermRef.current.write(completedInput);
            // 更新输入缓冲区
            setInputBuffer(completedInput);
            console.log('补全输入：',completedInput);
          } else {
            // 没找到补全项，恢复原始输入
            xtermRef.current.write(originalInput);
            setInputBuffer(originalInput);
          }
        } else if (errorMessage) {
          // 补全请求失败，显示原始输入
          console.error('Tab补全错误:', errorMessage);
          xtermRef.current.write(inputBuffer);
        }
        // 重置Tab补全等待状态
        setWaitingForTabCompletion(false);
      }
    });
    
    return () => {
      unsubTabCompletion();
    };
  }, [inputBuffer]);
  
  // Effect for handling SSH data
  useEffect(() => {
    const unsubSshData = webSocketService.onMessage('sshData', (message) => {
      // 检查是否是在等待Tab补全
      if (waitingForTabCompletion) {
        // Tab补全现在由专门的tabCompletionResponse处理，这里只进行简单处理
        const data = message.payload?.data;
        
        // 如果接收到BEL字符，可以记录日志
        if (data && data.includes('\u0007')) {
          console.log('通过SSH数据接收到BEL信号');
        }
      }
    });
    
    return () => {
      unsubSshData();
    };
  }, [waitingForTabCompletion, inputBuffer]);
  
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