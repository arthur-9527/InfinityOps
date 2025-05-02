import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量
dotenv.config();

export const config = {
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development',
  },
  ws: {
    port: process.env.WS_PORT || 3002,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  session: {
    timeout: parseInt(process.env.SESSION_TIMEOUT || '3600000', 10),
    maxPerUser: 5,
  },
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    dir: path.join(__dirname, '../../logs'),
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'ollama',
    ollama: {
      baseUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_DEFAULT_MODEL || 'llama2',
    },
  },
}; 