const WebSocket = require('ws');
const readline = require('readline');

const WS_URL = 'ws://localhost:3001';
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 创建测试函数
async function testSSHForwarding() {
  console.log('开始测试 SSH 命令转发功能...');
  
  // 创建 WebSocket 连接
  const ws = new WebSocket(WS_URL);
  
  // 处理 WebSocket 事件
  ws.on('open', () => {
    console.log('已连接到 WebSocket 服务器');
    promptForSSHConnection();
  });
  
  ws.on('message', (data) => {
    const message = JSON.parse(data);
    console.log(`收到消息类型: ${message.type}`);
    
    if (message.type === 'sshConnectionRequest') {
      promptForSSHPassword();
    } else if (message.type === 'sshConnected') {
      console.log('SSH 连接已建立');
      promptForCommand();
    } else if (message.type === 'sshData') {
      console.log('SSH 数据:', message.payload.data);
    } else if (message.type === 'commandSent') {
      console.log('命令已发送:', message.payload.command);
    } else if (message.type === 'instructionSent') {
      console.log('AI 指令已发送:', message.payload.instruction);
    } else {
      console.log('完整消息:', JSON.stringify(message, null, 2));
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket 错误:', error);
  });
  
  ws.on('close', () => {
    console.log('WebSocket 连接已关闭');
    process.exit(0);
  });
  
  // 提示用户输入 SSH 连接信息
  function promptForSSHConnection() {
    rl.question('SSH 主机 (默认: localhost): ', (host) => {
      host = host || 'localhost';
      
      rl.question('SSH 端口 (默认: 22): ', (port) => {
        port = port || '22';
        
        rl.question('SSH 用户名: ', (username) => {
          if (!username) {
            console.error('用户名不能为空');
            promptForSSHConnection();
            return;
          }
          
          const sshCommand = `ssh -p ${port} ${username}@${host}`;
          console.log('发送 SSH 连接命令:', sshCommand);
          
          ws.send(JSON.stringify({
            type: 'terminalCommand',
            payload: {
              command: sshCommand,
              path: '~'
            }
          }));
        });
      });
    });
  }
  
  // 提示用户输入 SSH 密码
  function promptForSSHPassword() {
    rl.question('SSH 密码: ', (password) => {
      if (!password) {
        console.error('密码不能为空');
        promptForSSHPassword();
        return;
      }
      
      ws.send(JSON.stringify({
        type: 'sshPasswordAuth',
        payload: {
          host: 'localhost', // 这里应该使用前面输入的值
          port: 22,
          username: 'test', // 这里应该使用前面输入的值
          password
        }
      }));
    });
  }
  
  // 提示用户输入命令
  function promptForCommand() {
    rl.question('输入命令 (终端命令/AI指令) [q 退出]: ', (input) => {
      if (input.toLowerCase() === 'q') {
        ws.close();
        return;
      }
      
      rl.question('发送类型 (1: 终端命令, 2: AI指令) [默认: 1]: ', (type) => {
        if (type === '2') {
          ws.send(JSON.stringify({
            type: 'aiInstruction',
            payload: {
              instruction: input
            }
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'terminalCommand',
            payload: {
              command: input,
              path: '~'
            }
          }));
        }
        
        // 继续提示输入命令
        setTimeout(promptForCommand, 1000);
      });
    });
  }
}

// 运行测试
testSSHForwarding().catch(console.error); 