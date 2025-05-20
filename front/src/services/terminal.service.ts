/**
 * A simple terminal service that processes commands
 */
export class TerminalService {
  private path: string = '~';
  private username: string = 'test@server';
  private sshConnected: boolean = false;
  private sshUsername: string | null = null;
  private sshHost: string | null = null;
  private displayHost: string = 'server'; // 统一显示的主机名

  /**
   * Processes a command and returns the appropriate output
   */
  processCommand(command: string): string {
    // Trim the command to remove whitespace
    const trimmedCommand = command.trim();
    
    // If SSH is not connected, show error for most commands
    if (!this.sshConnected && !trimmedCommand.toLowerCase().startsWith('ssh ')) {
      return 'Error: Not connected to remote server. Please connect first using: ssh username@host';
    }
    
    // Handle basic commands
    if (trimmedCommand.startsWith('cd ')) {
      return this.changeDirectory(trimmedCommand.substring(3));
    } else if (trimmedCommand === 'ls' || trimmedCommand === 'ls -la') {
      return this.listDirectory();
    } else if (trimmedCommand === 'pwd') {
      return this.path;
    } else if (trimmedCommand === 'whoami') {
      return this.sshConnected ? this.sshUsername || 'unknown' : this.username.split('@')[0];
    } else if (trimmedCommand === 'clear') {
      return '\x1b[2J\x1b[H'; // ANSI escape sequence to clear screen
    } else if (trimmedCommand === '') {
      return '';
    } else {
      // For SSH commands, the response will come from the server
      if (trimmedCommand.toLowerCase().startsWith('ssh ')) {
        return ''; // The SSH connection will be handled by websocket service
      }
      
      return this.sshConnected ? '' : `bash: command not found: ${trimmedCommand}`;
    }
  }

  /**
   * Returns the current prompt for display
   */
  getPrompt(): string {
    if (this.sshConnected && this.sshUsername) {
      // 始终使用统一的主机名显示，而不是实际的IP或主机名
      return `${this.sshUsername}@${this.displayHost}:${this.path}$ `;
    }
    return `[ssh]: `;
  }

  /**
   * Returns the current path
   */
  getPath(): string {
    return this.path;
  }

  /**
   * Sets the current path
   */
  setPath(path: string): void {
    if (path) {
      this.path = path;
    }
  }

  /**
   * Returns the current username
   */
  getUsername(): string {
    return this.sshConnected && this.sshUsername ? this.sshUsername : this.username;
  }

  /**
   * Set SSH connection status
   */
  setSshConnection(connected: boolean, username?: string, host?: string): void {
    this.sshConnected = connected;
    this.sshUsername = username || null;
    this.sshHost = host || null;
    
    // 实际的主机名保存，但不用于显示
    if (host) {
      // 如果需要，可以在这里添加逻辑来从IP地址派生一个友好的主机名
      // 但目前我们使用固定的"server"名称
    }
    
    // Reset path when connecting to a new SSH server
    if (connected) {
      this.path = '~';
    }
  }

  /**
   * Set display hostname (for presentation only)
   */
  setDisplayHost(hostname: string): void {
    this.displayHost = hostname;
  }

  /**
   * Check if SSH is connected
   */
  isSshConnected(): boolean {
    return this.sshConnected;
  }

  /**
   * Simulates changing directory
   */
  private changeDirectory(newPath: string): string {
    if (newPath === '~') {
      this.path = '~';
      return '';
    }
    
    if (newPath === '..') {
      if (this.path !== '~') {
        const pathParts = this.path.split('/');
        if (pathParts.length > 1) {
          pathParts.pop();
          this.path = pathParts.join('/') || '~';
        }
      }
      return '';
    }
    
    if (newPath.startsWith('/')) {
      this.path = newPath;
    } else if (this.path === '~') {
      this.path = newPath;
    } else {
      this.path = `${this.path}/${newPath}`.replace(/\/+/g, '/');
    }
    
    return '';
  }

  /**
   * Simulates listing a directory
   */
  private listDirectory(): string {
    // If SSH is connected, don't return any output as it will come from server
    if (this.sshConnected) {
      return '';
    }
    
    // Return dummy directory listings based on the current path
    if (this.path === '/Applications') {
      return 'App Store.app\nChrome.app\nFinder.app\nInfinityOps.app\nSafari.app\nTerminal.app\nVS Code.app';
    } else if (this.path === '~' || this.path === '/home/test') {
      return 'Desktop\nDocuments\nDownloads\nPictures\nMusic\nInfinityOps';
    } else {
      return 'file1.txt\nfile2.txt\nfolder1\nfolder2';
    }
  }
}

// Export a singleton instance
export const terminalService = new TerminalService(); 