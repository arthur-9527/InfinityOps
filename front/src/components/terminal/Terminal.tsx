import React, { useEffect, useRef, useState } from 'react';
import { XTerm } from '@pablo-lion/xterm-react';
import '@xterm/xterm/css/xterm.css';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { terminalService } from '../../services/terminal.service';

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
  
  useEffect(() => {
    // Attempt to fit the terminal whenever the window resizes
    const handleResize = () => {
      if (xtermRef.current) {
        try {
          xtermRef.current.fit?.();
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
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [initialCommand]);
  
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
      
      if (isEnter) {
        // Process the command
        term.write('\r\n');
        
        if (inputBuffer.trim().length > 0) {
          // Add command to history
          setCommandHistory(prev => [...prev, inputBuffer]);
          setHistoryIndex(-1);
          
          // Process command
          const output = terminalService.processCommand(inputBuffer);
          if (output) {
            term.write(output + '\r\n');
          }
        }
        
        // Write the prompt and reset input buffer
        term.write(terminalService.getPrompt());
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
          } else {
            setLastCharLen(1);
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
          } else {
            setLastCharLen(1);
          }
        } else if (historyIndex === 0) {
          // Clear buffer when reaching the end of history
          clearCurrentInput(inputBuffer);
          
          setHistoryIndex(-1);
          setInputBuffer('');
          setLastCharLen(1);
        }
      } else {
        // Regular character input
        term.write(data);
        setInputBuffer(prev => prev + data);
        
        // 更新最后输入字符的长度
        setLastCharLen(getCharWidth(data));
      }
    } catch (err) {
      console.error('Error handling user input:', err);
      setError('Failed to process input');
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
        borderBottomRightRadius: '6px'
      }}
      onClick={() => {
        // Focus the terminal when container is clicked
        if (xtermRef.current) {
          xtermRef.current.focus();
        }
      }}
    >
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