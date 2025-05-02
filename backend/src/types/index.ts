export interface User {
  id: string;
  username: string;
  password: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  id: string;
  userId: string;
  host: string;
  port: number;
  username: string;
  status: SessionStatus;
  createdAt: Date;
  lastActivity: Date;
}

export enum SessionStatus {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error'
}

export interface SSHConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export interface WSMessage {
  type: MessageType;
  data: any;
}

export enum MessageType {
  // Client -> Server
  INPUT = 'input',
  RESIZE = 'resize',
  PING = 'ping',
  
  // Server -> Client
  OUTPUT = 'output',
  ERROR = 'error',
  PONG = 'pong'
}

export interface TerminalSize {
  cols: number;
  rows: number;
} 