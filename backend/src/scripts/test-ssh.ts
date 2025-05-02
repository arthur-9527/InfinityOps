#!/usr/bin/env ts-node
/**
 * SSH测试脚本
 * 用于测试SSH连接功能
 */
import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { SSHSessionImpl } from '../services/ssh/sshSession';
import { createModuleLogger } from '../utils/logger';

// 创建日志记录器
const logger = createModuleLogger('ssh-test');

/**
 * 显示帮助信息
 */
function showHelp() {
  console.log(`
SSH连接测试工具
==================================================
用法: npm run test:ssh -- [参数]

参数:
  --host, -h      主机名或IP (默认: 127.0.0.1)
  --port, -p      端口号 (默认: 22)
  --user, -u      用户名 (默认: root)
  --password, -P  密码 (可选)
  --key, -k       私钥文件路径 (可选)
  --passphrase    私钥密码 (如果私钥有加密)
  --debug, -d     启用调试模式
  --help          显示帮助信息

示例:
  npm run test:ssh -- --host 192.168.1.100 --user admin --password 123456
  npm run test:ssh -- -h 192.168.1.100 -u admin -k ~/.ssh/id_rsa
==================================================
  `);
  process.exit(0);
}

/**
 * 解析命令行参数
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options: any = {
    host: '127.0.0.1',
    port: 22,
    username: 'root',
    debug: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    switch (arg) {
      case '--host':
      case '-h':
        options.host = args[++i];
        break;
      case '--port':
      case '-p':
        options.port = parseInt(args[++i], 10);
        break;
      case '--user':
      case '-u':
        options.username = args[++i];
        break;
      case '--password':
      case '-P':
        options.password = args[++i];
        break;
      case '--key':
      case '-k':
        const keyPath = path.resolve(args[++i]);
        if (fs.existsSync(keyPath)) {
          options.privateKey = fs.readFileSync(keyPath);
          console.log(`已加载私钥: ${keyPath}`);
        } else {
          console.error(`错误: 私钥文件不存在: ${keyPath}`);
          process.exit(1);
        }
        break;
      case '--passphrase':
        options.passphrase = args[++i];
        break;
      case '--debug':
      case '-d':
        options.debug = true;
        break;
      case '--help':
        showHelp();
        break;
      default:
        // 兼容旧的位置参数方式
        if (!options.host && arg.includes('.')) options.host = arg;
        else if (!isNaN(Number(arg)) && Number(arg) > 0 && Number(arg) < 65536) options.port = parseInt(arg, 10);
        else if (!options.username) options.username = arg;
        else if (!options.password) options.password = arg;
        break;
    }
  }

  // 确保至少有一种认证方式
  if (!options.password && !options.privateKey) {
    console.log('警告: 未提供密码或私钥，将尝试使用系统SSH配置。');
  }

  return options;
}

/**
 * 主函数
 */
async function main() {
  // 解析命令行参数
  const options = parseArgs();
  
  if (options.debug) {
    console.log('调试模式已启用');
    console.log('连接选项:', {
      ...options,
      password: options.password ? '******' : undefined,
      privateKey: options.privateKey ? '(已提供)' : undefined,
      passphrase: options.passphrase ? '******' : undefined
    });
  }

  // 显示连接信息
  console.log(`
SSH连接测试工具
===================
连接目标: ${options.username}@${options.host}:${options.port}
认证方式: ${options.password ? '密码' : ''}${options.password && options.privateKey ? ' + ' : ''}${options.privateKey ? '私钥' : ''}
输入 'exit' 或 Ctrl+C 退出
===================
  `);

  // 创建SSH会话
  const session = new SSHSessionImpl(options);

  try {
    // 监听数据接收事件
    session.on('data', (data: string) => {
      process.stdout.write(data);
    });

    // 监听错误事件
    session.on('error', (err: Error) => {
      console.error(`\n连接错误: ${err.message}`);
      session.close();
    });

    // 监听关闭事件
    session.on('close', () => {
      console.log('\n连接已关闭');
      process.exit(0);
    });

    // 监听会话关闭事件
    session.on('session-close', () => {
      console.log('\nSSH会话已关闭');
      process.exit(0);
    });

    // 连接到服务器
    console.log('正在连接...');
    await session.connect({
      term: 'xterm-256color',
      rows: process.stdout.rows || 24,
      cols: process.stdout.columns || 80
    });
    console.log('连接成功!');
    
    // 设置原始模式,捕获按键输入
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // 监听按键事件
    process.stdin.on('keypress', (str, key) => {
      // 如果按下Ctrl+C，则关闭连接并退出
      if (key && key.ctrl && key.name === 'c') {
        console.log('\n用户中断，正在断开连接...');
        session.close();
        return;
      }

      // 发送数据到SSH会话
      if (str) session.write(str);
    });

    // 监听窗口大小变化
    process.stdout.on('resize', () => {
      const { columns, rows } = process.stdout;
      if (columns && rows) {
        session.resize(rows, columns);
        if (options.debug) {
          logger.debug(`窗口大小调整: ${columns}x${rows}`);
        }
      }
    });

    // 初始设置终端大小
    if (process.stdout.columns && process.stdout.rows) {
      session.resize(process.stdout.rows, process.stdout.columns);
    }

  } catch (error) {
    console.error('连接失败:', (error as Error).message);
    if (options.debug) {
      console.error('错误详情:', error);
    }
    process.exit(1);
  }
}

// 捕获未处理的异常
process.on('uncaughtException', (err) => {
  console.error('未捕获的异常:', err);
  process.exit(1);
});

// 执行主函数
main().catch(err => {
  console.error('程序错误:', err);
  process.exit(1);
}); 