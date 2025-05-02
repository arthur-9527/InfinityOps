import React, { useEffect, useRef, useLayoutEffect, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import 'xterm/css/xterm.css';

interface TerminalProps {
  onData?: (data: string) => void;
  className?: string;
}

const XTerminal: React.FC<TerminalProps> = ({ onData, className }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const fitAddon = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  // 首先确保DOM已经准备好
  useEffect(() => {
    if (terminalRef.current) {
      setIsReady(true);
    }
  }, []);

  // 然后初始化终端
  useEffect(() => {
    if (!isReady || !terminalRef.current || terminal.current) return;

    const initTerminal = async () => {
      try {
        const container = terminalRef.current;
        if (!container) return;

        // 等待一帧以确保容器尺寸已经计算
        await new Promise(resolve => requestAnimationFrame(resolve));

        const term = new Terminal({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: 'Consolas, "Courier New", monospace',
          theme: {
            background: '#1e1e1e',
            foreground: '#ffffff'
          },
          rows: 24,
          cols: 80,
          convertEol: true,
          scrollback: 1000,
          allowProposedApi: true
        });

        const fit = new FitAddon();
        const webLinks = new WebLinksAddon();

        // 保存引用
        terminal.current = term;
        fitAddon.current = fit;

        // 加载插件
        term.loadAddon(fit);
        term.loadAddon(webLinks);

        // 打开终端前确保容器尺寸正确
        container.style.width = '100%';
        container.style.height = '100%';

        // 等待下一帧以确保样式已应用
        await new Promise(resolve => requestAnimationFrame(resolve));

        // 打开终端
        term.open(container);

        // 再次等待以确保终端已完全打开
        await new Promise(resolve => setTimeout(resolve, 0));

        // 执行初始fit
        if (fit && container.offsetHeight > 0 && container.offsetWidth > 0) {
          fit.fit();
          term.focus();
        }

        // 设置数据处理
        if (onData) {
          term.onData(data => {
            onData(data);
          });
        }

        // 处理窗口调整大小
        const handleResize = () => {
          if (fit && container.offsetHeight > 0 && container.offsetWidth > 0) {
            requestAnimationFrame(() => {
              try {
                fit.fit();
              } catch (e) {
                console.warn('Failed to fit terminal on resize:', e);
              }
            });
          }
        };

        window.addEventListener('resize', handleResize);

        // 返回清理函数
        return () => {
          window.removeEventListener('resize', handleResize);
          if (term) {
            term.dispose();
          }
          terminal.current = null;
          fitAddon.current = null;
        };
      } catch (error) {
        console.error('Failed to initialize terminal:', error);
      }
    };

    initTerminal();
  }, [isReady, onData]);

  return (
    <div
      ref={terminalRef}
      className={`xterm-container ${className || ''}`}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '400px',
        minWidth: '600px',
        position: 'relative',
        overflow: 'hidden',
        display: 'block',
        backgroundColor: '#1e1e1e'
      }}
    />
  );
};

export default XTerminal; 