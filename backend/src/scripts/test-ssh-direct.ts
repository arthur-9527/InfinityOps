#!/usr/bin/env ts-node
/**
 * 直接使用SSH2库测试SSH连接
 * 用于验证SSH2库的连接功能
 */
import * as readline from 'readline';
import { Client } from 'ssh2';

// 解析命令行参数
const args = process.argv.slice(2);
const host = args[0] || '127.0.0.1';
const port = parseInt(args[1] || '22', 10);
const username = args[2] || 'root';
const password = args[3] || '';

console.log(`
SSH2直接连接测试
====================
正在连接: ${username}@${host}:${port}
使用密码: ${password ? '是' : '否'}
====================
`);

// 创建SSH客户端
const conn = new Client();

// 监听连接事件
conn.on('ready', () => {
  console.log('连接成功!');
  
  // 创建Shell会话
  conn.shell((err, stream) => {
    if (err) {
      console.error('创建Shell失败:', err.message);
      conn.end();
      process.exit(1);
      return;
    }

    // 输出Shell数据
    stream.on('data', (data: Buffer) => {
      process.stdout.write(data);
    });

    stream.on('close', () => {
      console.log('Shell会话已关闭');
      conn.end();
      process.exit(0);
    });

    // 设置原始模式以捕获按键
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }

    // 监听按键事件
    process.stdin.on('keypress', (str, key) => {
      // 如果按下Ctrl+C，则关闭连接并退出
      if (key && key.ctrl && key.name === 'c') {
        console.log('\n用户中断，正在断开连接...');
        stream.close();
        return;
      }

      // 发送数据到SSH会话
      if (str) {
        stream.write(str);
      }
    });

    // 监听窗口大小变化
    process.stdout.on('resize', () => {
      const { columns, rows } = process.stdout;
      if (columns && rows) {
        stream.setWindow(rows, columns, 0, 0);
      }
    });

    // 初始设置终端大小
    if (process.stdout.columns && process.stdout.rows) {
      stream.setWindow(process.stdout.rows, process.stdout.columns, 0, 0);
    }
  });
});

// 监听错误事件
conn.on('error', (err) => {
  console.error('连接错误:', err.message);
  process.exit(1);
});

// 监听连接结束事件
conn.on('end', () => {
  console.log('连接已结束');
});

// 监听连接关闭事件
conn.on('close', () => {
  console.log('连接已关闭');
});

// 监听Banner信息
conn.on('banner', (message: string) => {
  console.log('SSH Banner:', message);
});

// 连接到SSH服务器
conn.connect({
  host,
  port,
  username,
  password,
  debug: function(message: string) {
    console.log('SSH2 Debug:', message);
  }
}); 