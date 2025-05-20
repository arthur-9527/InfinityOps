import winston from 'winston';
import { config } from '../config';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 日志级别类型
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// 颜色配置
const colors: Record<LogLevel | 'reset', string> = {
  error: '\x1b[31m',    // 红色
  warn: '\x1b[33m',     // 黄色
  info: '\x1b[36m',     // 青色
  debug: '\x1b[32m',    // 绿色
  reset: '\x1b[0m'      // 重置
};

// 创建自定义格式
const customFormat = winston.format.printf(({ level, message, timestamp, module }) => {
  const color = colors[level as LogLevel] || colors.reset;
  const moduleStr = module ? ` [${module}]` : '';
  return `${timestamp} ${color}[${level.toUpperCase()}]${colors.reset}${moduleStr}: ${message}`;
});

// 确保日志目录存在
const logDir = path.join(__dirname, '../../logs');
import { mkdirSync } from 'fs';
try {
  mkdirSync(logDir, { recursive: true });
} catch (error) {
  console.error('Error creating log directory:', error);
}

// 创建日志记录器
export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    customFormat
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log')
    })
  ],
});

// 创建带模块名的日志记录器
export const createModuleLogger = (moduleName: string) => {
  return {
    error: (message: string, ...args: any[]) => logger.error(message, { module: moduleName, ...args }),
    warn: (message: string, ...args: any[]) => logger.warn(message, { module: moduleName, ...args }),
    info: (message: string, ...args: any[]) => logger.info(message, { module: moduleName, ...args }),
    debug: (message: string, ...args: any[]) => logger.debug(message, { module: moduleName, ...args }),
  };
}; 