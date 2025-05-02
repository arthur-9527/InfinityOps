/**
 * SSH服务接口定义
 */

export interface SSHConnectionConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string | Buffer;
  passphrase?: string;
  keepaliveInterval?: number;
  readyTimeout?: number;
  debug?: boolean;
}

export interface SSHSessionOptions {
  rows?: number;
  cols?: number;
  term?: string;
}

export interface SSHConnectionStatus {
  connected: boolean;
  host: string;
  username: string;
  message?: string;
  error?: Error;
}

export interface SSHSession {
  id: string;
  connectionConfig: SSHConnectionConfig;
  resize(rows: number, cols: number): void;
  write(data: string): void;
  close(): void;
  isConnected(): boolean;
  on(event: string, listener: (...args: any[]) => void): void;
  removeListener(event: string, listener: (...args: any[]) => void): void;
}

export interface SSHService {
  createSession(config: SSHConnectionConfig, options?: SSHSessionOptions): Promise<SSHSession>;
  getSession(id: string): SSHSession | null;
  closeSession(id: string): Promise<boolean>;
  getActiveSessions(): SSHSession[];
} 