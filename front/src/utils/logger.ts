// 日志级别类型
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// 日志级别样式
const logStyles: Record<LogLevel, string[]> = {
  error: ['color: #ff0000', 'font-weight: bold'], // 红色
  warn: ['color: #ffa500', 'font-weight: bold'],  // 橙色
  info: ['color: #00bcd4', 'font-weight: bold'],  // 青色
  debug: ['color: #4caf50', 'font-weight: bold'], // 绿色
};

// 获取当前时间戳
const getTimestamp = () => {
  return new Date().toISOString().replace('T', ' ').split('.')[0];
};

// 创建基础日志记录器
class Logger {
  private static formatMessage(level: LogLevel, module: string, message: string): [string, string[]] {
    const timestamp = getTimestamp();
    const formattedMessage = `${timestamp} [${level.toUpperCase()}]${module ? `[${module}]` : ''}: ${message}`;
    return [formattedMessage, logStyles[level]];
  }

  static error(message: string, module: string = '') {
    const [msg, styles] = this.formatMessage('error', module, message);
    console.log(`%c${msg}`, styles.join(';'));
  }

  static warn(message: string, module: string = '') {
    const [msg, styles] = this.formatMessage('warn', module, message);
    console.log(`%c${msg}`, styles.join(';'));
  }

  static info(message: string, module: string = '') {
    const [msg, styles] = this.formatMessage('info', module, message);
    console.log(`%c${msg}`, styles.join(';'));
  }

  static debug(message: string, module: string = '') {
    const [msg, styles] = this.formatMessage('debug', module, message);
    console.log(`%c${msg}`, styles.join(';'));
  }
}

// 创建模块日志记录器
export const createModuleLogger = (moduleName: string) => {
  return {
    error: (message: string) => Logger.error(message, moduleName),
    warn: (message: string) => Logger.warn(message, moduleName),
    info: (message: string) => Logger.info(message, moduleName),
    debug: (message: string) => Logger.debug(message, moduleName),
  };
};

export default Logger; 