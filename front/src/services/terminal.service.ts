/**
 * A simple terminal service that processes commands
 */
export class TerminalService {
  private path: string = '~';
  private username: string = 'test@server';

  /**
   * Processes a command and returns the appropriate output
   */
  processCommand(command: string): string {
    // Trim the command to remove whitespace
    const trimmedCommand = command.trim();
    
    // Handle basic commands
    if (trimmedCommand.startsWith('cd ')) {
      return this.changeDirectory(trimmedCommand.substring(3));
    } else if (trimmedCommand === 'ls' || trimmedCommand === 'ls -la') {
      return this.listDirectory();
    } else if (trimmedCommand === 'pwd') {
      return this.path;
    } else if (trimmedCommand === 'whoami') {
      return this.username.split('@')[0];
    } else if (trimmedCommand === 'clear') {
      return '\x1b[2J\x1b[H'; // ANSI escape sequence to clear screen
    } else if (trimmedCommand === '') {
      return '';
    } else {
      return `bash: command not found: ${trimmedCommand}`;
    }
  }

  /**
   * Returns the current prompt for display
   */
  getPrompt(): string {
    return `${this.username} ${this.path} $ `;
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