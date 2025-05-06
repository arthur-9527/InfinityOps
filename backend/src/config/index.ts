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
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '123578964',
    db: 0,
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'ollama',
    ollama: {
      apiUrl: process.env.OLLAMA_API_URL || 'http://localhost:11434',
      defaultModel: process.env.OLLAMA_DEFAULT_MODEL || 'llama2',
      contextWindow: parseInt(process.env.OLLAMA_CONTEXT_WINDOW || '4096', 10),
      timeout: parseInt(process.env.OLLAMA_TIMEOUT || '60000', 10), // 60 seconds default
      maxTokens: parseInt(process.env.OLLAMA_MAX_TOKENS || '2048', 10),
      temperature: parseFloat(process.env.OLLAMA_TEMPERATURE || '0.7')
    },
  },
}; 