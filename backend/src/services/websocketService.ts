import WebSocket, { WebSocketServer } from 'ws';
import { IncomingMessage } from 'http';
import { createModuleLogger } from '../utils/logger';
import { config } from '../config';
import { exec } from 'child_process';
import { promisify } from 'util';
import { commandAnalysisService } from './commandAnalysisService';
import { AIMessage } from '../modules/ai/ai.interface';
import { SSHServiceImpl } from './ssh/sshService';
import { SSHConnectionConfig } from './ssh/ssh.interface';
import { mcpIntegrationService } from './mcp-integration.service';

const logger = createModuleLogger('websocket');
const execAsync = promisify(exec);

// Client connection map
const clients = new Map<string, WebSocket>();

// Client SSH session map
const clientSshSessions = new Map<string, { sessionId: string, connected: boolean }>();

// SSH service instance
const sshService = new SSHServiceImpl();

// Message history for AI context (keep limited history per client)
const clientMessageHistory = new Map<string, AIMessage[]>();
const MAX_HISTORY_LENGTH = 10;

/**
 * Process SSH connection command
 */
async function processSshConnectionCommand(command: string, clientId: string): Promise<any> {
  // Simple SSH command pattern matching: ssh username@host or ssh -p port username@host
  const sshCommandRegex = /^ssh\s+(?:-p\s+(\d+)\s+)?([^@\s]+)@([^\s]+)$/i;
  const match = command.match(sshCommandRegex);
  
  if (!match) {
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: 'Invalid SSH command format. Use: ssh username@host or ssh -p port username@host',
        success: false
      }
    };
  }
  
  const port = match[1] ? parseInt(match[1], 10) : 22;
  const username = match[2];
  const host = match[3];
  
  logger.info(`Attempting SSH connection: ${username}@${host}:${port}`);
  
  try {
    // Close existing session if any
    const existingSession = clientSshSessions.get(clientId);
    if (existingSession && existingSession.sessionId) {
      await sshService.closeSession(existingSession.sessionId);
    }
    
    // Create a new SSH config
    const sshConfig: SSHConnectionConfig = {
      host,
      port,
      username,
      // We'll prompt for password later
    };
    
    // Store pending connection info (not connected yet)
    clientSshSessions.set(clientId, {
      sessionId: '', // Will be updated after connection
      connected: false
    });
    
    return {
      type: 'sshConnectionRequest',
      timestamp: Date.now(),
      payload: {
        host,
        port,
        username,
        displayHost: 'server',
        requiresPassword: true
      }
    };
  } catch (error) {
    logger.error(`SSH connection preparation failed: ${error}`);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: `Failed to prepare SSH connection: ${(error as Error).message}`,
        success: false
      }
    };
  }
}

/**
 * Complete SSH connection with password
 */
async function completeSshConnection(clientId: string, config: SSHConnectionConfig): Promise<any> {
  try {
    logger.info(`Connecting to SSH: ${config.username}@${config.host}:${config.port}`);
    
    // Create a new SSH session
    const session = await sshService.createSession(config, {
      rows: 24,
      cols: 80,
      term: 'xterm-256color'
    });
    
    // Store session info
    clientSshSessions.set(clientId, {
      sessionId: session.id,
      connected: true
    });
    
    // Set up data event forwarding
    session.on('data', (data: string) => {
      // 添加详细日志，记录从SSH接收到的数据
      const dataStr = data.toString();
      const hexData = Buffer.from(dataStr).toString('hex');
      
      // 记录数据详情
      if (dataStr.length < 100) {
        // 对于短数据，完整记录其内容
        logger.debug(`SSH数据接收 (${clientId}): 长度=${dataStr.length}, 内容="${dataStr.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}", 十六进制=${hexData}`);
      } else {
        // 对于长数据，只记录摘要
        logger.debug(`SSH数据接收 (${clientId}): 长度=${dataStr.length}, 摘要="${dataStr.substring(0, 50).replace(/\n/g, '\\n').replace(/\r/g, '\\r')}...", 十六进制前缀=${hexData.substring(0, 100)}`);
      }
      
      const client = clients.get(clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'sshData',
          timestamp: Date.now(),
          payload: {
            data
          }
        }));
      }
    });
    
    // Handle session close
    session.on('close', () => {
      clientSshSessions.delete(clientId);
      const client = clients.get(clientId);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({
          type: 'sshDisconnected',
          timestamp: Date.now(),
          payload: {
            message: 'SSH connection closed'
          }
        }));
      }
    });
    
    logger.info(`SSH connection established for client ${clientId}`);
    return {
      type: 'sshConnected',
      timestamp: Date.now(),
      payload: {
        sessionId: session.id,
        host: config.host,
        username: config.username,
        displayHost: 'server'
      }
    };
  } catch (error) {
    logger.error(`SSH connection failed: ${error}`);
    clientSshSessions.delete(clientId);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        output: `Failed to connect to SSH server: ${(error as Error).message}`,
        success: false
      }
    };
  }
}

/**
 * Process SSH command
 */
async function processSshCommand(command: string, clientId: string): Promise<any> {
  const sessionInfo = clientSshSessions.get(clientId);
  if (!sessionInfo || !sessionInfo.connected) {
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: 'No active SSH connection. Please connect first using: ssh username@host',
        success: false
      }
    };
  }
  
  const session = sshService.getSession(sessionInfo.sessionId);
  if (!session) {
    clientSshSessions.delete(clientId);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: 'SSH session not found or expired. Please reconnect.',
        success: false
      }
    };
  }
  
  try {
    // Send command to SSH session
    session.write(command + '\n');
    
    // No immediate response, as the output will come through the SSH data event
    return {
      type: 'commandSent',
      timestamp: Date.now(),
      payload: {
        command,
        success: true
      }
    };
  } catch (error) {
    logger.error(`Error sending command to SSH: ${error}`);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: `Error sending command: ${(error as Error).message}`,
        success: false
      }
    };
  }
}

/**
 * 处理终端命令并返回结果
 */
async function processTerminalCommand(command: string, path: string): Promise<string> {
  try {
    logger.info(`执行终端命令: ${command}, 路径: ${path}`);
    
    // 模拟路径映射 - 在实际生产环境中，应该进行更严格的验证和安全检查
    const resolvedPath = path === '~' ? '/home/test' : path;
    
    // 简单的命令处理 - 这里只是模拟，实际生产环境需要更严格的安全措施
    if (command.trim() === 'clear') {
      return ''; // 特殊处理clear命令
    }
    
    // 通过child_process.exec执行命令
    // 注意：这里直接执行用户输入的命令存在安全风险，实际应用中应该进行严格的输入验证和限制
    const { stdout, stderr } = await execAsync(command, { 
      cwd: resolvedPath,
      timeout: 5000, // 5秒超时
      maxBuffer: 1024 * 1024 // 1MB缓冲区
    });
    
    if (stderr) {
      logger.warn(`命令执行产生错误: ${stderr}`);
      return stderr;
    }
    
    logger.info(`命令执行成功: ${command}`);
    return stdout;
  } catch (error) {
    logger.error(`命令执行失败: ${error}`);
    return `Error: ${(error as Error).message}`;
  }
}

/**
 * Process terminal command through AI analysis and then forward to SSH
 */
async function processCommandWithAI(command: string, path: string, clientId: string): Promise<any> {
  // SSH连接命令处理
  if (command.trim().toLowerCase().startsWith('ssh ')) {
    return processSshConnectionCommand(command, clientId);
  }
  
  // 获取命令历史记录
  const history = clientMessageHistory.get(clientId) || [];
  logger.info(`Command history for client ${clientId}: ${JSON.stringify(history)}`);
  logger.info(`Command: ${command}`);
  logger.info(`Path: ${path}`);
  
  // 检查SSH连接状态
  const sessionInfo = clientSshSessions.get(clientId);
  const isConnected = sessionInfo && sessionInfo.connected;
  
  // 未连接SSH时，显示错误提示
  if (!isConnected) {
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: 'No active SSH connection. Please connect first using: ssh username@host',
        success: false
      }
    };
  }
  
  // 检查是否是直接跳过的命令
  const baseCommand = command.trim().split(' ')[0];
  const DEFAULT_BYPASS_COMMANDS = [
    'ls', 'cd', 'pwd', 'clear', 'history', 'echo', 'cat', 'mkdir', 
    'touch', 'cp', 'mv', 'date', 'whoami', 'df', 'du', 'free',
    'ps', 'top', 'uname', 'hostname', 'ifconfig', 'ip'
  ];
  
  // 获取环境变量配置的 bypass 模式
  const bypassMode = process.env.COMMAND_BYPASS_MODE || 'common';
  
  // 直接执行简单命令的条件：
  // 1. bypass模式是common或all 
  // 2. 命令在默认跳过列表中
  // 3. 不包含危险前缀（sudo, rm, >, >>, |, ;, &&, ||）
  const ALWAYS_ANALYZE_PREFIXES = [
    'sudo', 'rm', '>', '>>', '|', ';', '&&', '||'
  ];
  const shouldBypass = (bypassMode !== 'none') && 
                      DEFAULT_BYPASS_COMMANDS.includes(baseCommand) &&
                      !ALWAYS_ANALYZE_PREFIXES.some(prefix => command.includes(prefix));
  
  if (shouldBypass) {
    // 简单命令直接执行，不经过MCP分析
    logger.info(`Command '${command}' bypassing MCP analysis (simple command)`);
    
    try {
      // 获取SSH会话
      const session = sshService.getSession(sessionInfo.sessionId);
      if (!session) {
        logger.error(`SSH session not found for client ${clientId}`);
        clientSshSessions.delete(clientId);
        return {
          type: 'terminalResponse',
          timestamp: Date.now(),
          payload: {
            command,
            output: 'SSH session not found or expired. Please reconnect.',
            success: false
          }
        };
      }
      
      // 直接发送命令到SSH
      logger.info(`Executing bypassed command via SSH: ${command}`);
      session.write(command + '\n');
      
      return {
        type: 'commandSent',
        timestamp: Date.now(),
        payload: {
          command,
          success: true,
          bypassedMCP: true
        }
      };
    } catch (error) {
      logger.error(`Error sending bypassed command to SSH: ${error}`);
      return {
        type: 'terminalResponse',
        timestamp: Date.now(),
        payload: {
          command,
          output: `Error sending command: ${(error as Error).message}`,
          success: false
        }
      };
    }
  }
  
  // 检查是否需要直接处理确认响应
  const isConfirmationResponse = /(^|\s+)(y|yes|n|no)(\s+|$)/i.test(command.trim().toLowerCase());
  
  if (isConfirmationResponse) {
    // 确认响应通过MCP处理
    const confirmed = /^(y|yes|是|确认)$/i.test(command.trim());
    const response = await mcpIntegrationService.handleConfirmation(
      clientId,
      confirmed,
      command
    );
    
    if (response.shouldProcess && confirmed) {
      // 用户确认执行命令
      const metadata = response.metadata || {};
      const originalCommand = metadata.command || '';
      
      // 获取SSH会话
      const session = sshService.getSession(sessionInfo.sessionId);
      if (!session) {
        logger.error(`SSH session not found for client ${clientId}`);
        clientSshSessions.delete(clientId);
        return {
          type: 'terminalResponse',
          timestamp: Date.now(),
          payload: {
            command: originalCommand,
            output: 'SSH session not found or expired. Please reconnect.',
            success: false
          }
        };
      }
      
      try {
        // 执行原始命令
        logger.info(`Executing confirmed command via SSH: ${originalCommand}`);
        
        // 立即将命令发送到SSH会话
        session.write(originalCommand + '\n');
        
        // 返回空响应，SSH会显示结果
        return {
          type: 'commandSent',
          timestamp: Date.now(),
          payload: {
            command: originalCommand,
            success: true,
            isConfirmed: true,
            immediateExecution: true
          }
        };
      } catch (error) {
        logger.error(`Error sending confirmed command to SSH: ${error}`);
        return {
          type: 'terminalResponse',
          timestamp: Date.now(),
          payload: {
            command: originalCommand,
            output: `Error sending command: ${(error as Error).message}`,
            success: false
          }
        };
      }
    } else {
      // 用户拒绝执行命令
      return {
        type: 'terminalResponse',
        timestamp: Date.now(),
        payload: {
          command: command,
          output: response.content,
          analysisType: 'command_cancelled',
          path,
          success: false
        }
      };
    }
  }
  
  // 不是简单命令也不是确认响应，使用MCP系统处理
  try {
    // 使用MCP集成服务处理命令
    const mcpResponse = await mcpIntegrationService.analyzeIntentAndProcess(
      clientId, // 使用clientId作为sessionId
      command,
      path,
      undefined, // userId
      { history } // 传递历史记录作为额外上下文
    );
    
    // 如果命令生成了有意义的回复，更新历史记录
    if (mcpResponse.type === 'ai_response') {
      updateClientHistory(clientId, command, mcpResponse.content);
    }
    
    // 根据MCP响应类型处理
    if (mcpResponse.type === 'ai_response') {
      // AI回答类型直接返回内容
      return {
        type: 'terminalResponse',
        timestamp: Date.now(),
        payload: {
          command,
          output: mcpResponse.content,
          analysisType: mcpResponse.type,
          path,
          success: mcpResponse.success,
          bypassedAI: false
        }
      };
    } else if (mcpResponse.type === 'script_execution') {
      // 脚本执行类型
      if (mcpResponse.requireConfirmation && mcpResponse.isAwaitingConfirmation) {
        return {
          type: 'terminalResponse',
          timestamp: Date.now(),
          payload: {
            command,
            output: mcpResponse.content,
            analysisType: 'confirmation_required',
            path,
            success: true,
            awaitingConfirmation: true,
            showPrompt: false
          }
        };
      }
      
      // 脚本已被确认执行
      if (mcpResponse.shouldProcess) {
        // 获取SSH会话
        const session = sshService.getSession(sessionInfo.sessionId);
        if (!session) {
          logger.error(`SSH session not found for client ${clientId}`);
          clientSshSessions.delete(clientId);
          return {
            type: 'terminalResponse',
            timestamp: Date.now(),
            payload: {
              command,
              output: 'SSH session not found or expired. Please reconnect.',
              success: false
            }
          };
        }
        
        // 执行脚本
        const metadata = mcpResponse.metadata || {};
        const script = metadata.script || '';
        const scriptType = metadata.scriptType || 'bash';
        
        // 生成随机脚本文件名
        const randomSuffix = Math.floor(Math.random() * 1000);
        const timestamp = new Date().getTime();
        const scriptFileName = `script_${timestamp}_${randomSuffix}.${scriptType === 'python' ? 'py' : 'sh'}`;
        
        // 保存和执行脚本
        const saveScriptCmd = `cat > ${scriptFileName} << 'EOL'\n${script}\nEOL\n`;
        let execCmd = '';
        
        if (scriptType === 'python') {
          execCmd = `python ${scriptFileName}`;
        } else if (scriptType === 'node') {
          execCmd = `node ${scriptFileName}`;
        } else if (scriptType === 'ruby') {
          execCmd = `ruby ${scriptFileName}`;
        } else {
          execCmd = `bash ${scriptFileName}`;
        }
        
        // 写入脚本保存命令
        session.write(saveScriptCmd);
        
        // 添加小延迟确保文件写入完成
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 写入执行命令
        session.write(`${execCmd}\n`);
        
        return {
          type: 'terminalResponse',
          timestamp: Date.now(),
          payload: {
            command,
            output: `正在执行${scriptType}脚本...\n脚本内容已保存至 ${scriptFileName}\n执行命令: ${execCmd}`,
            analysisType: 'script_execution',
            path,
            success: true,
            showPrompt: false
          }
        };
      } else {
        // 脚本不应该执行
        return {
          type: 'terminalResponse',
          timestamp: Date.now(),
          payload: {
            command,
            output: mcpResponse.content,
            analysisType: 'script_cancelled',
            path,
            success: false
          }
        };
      }
    } else if (mcpResponse.type === 'bash_execution' || mcpResponse.type === 'command_execution') {
      // bash执行类型
      if (mcpResponse.requireConfirmation && mcpResponse.isAwaitingConfirmation) {
        return {
          type: 'terminalResponse',
          timestamp: Date.now(),
          payload: {
            command,
            output: mcpResponse.content,
            analysisType: 'confirmation_required',
            path,
            success: true,
            awaitingConfirmation: true,
            showPrompt: false
          }
        };
      }
      
      // 命令已被确认执行
      if (mcpResponse.shouldProcess) {
        // 获取SSH会话
        const session = sshService.getSession(sessionInfo.sessionId);
        if (!session) {
          logger.error(`SSH session not found for client ${clientId}`);
          clientSshSessions.delete(clientId);
          return {
            type: 'terminalResponse',
            timestamp: Date.now(),
            payload: {
              command,
              output: 'SSH session not found or expired. Please reconnect.',
              success: false
            }
          };
        }
        
        // 使用MCP提供的命令或原始命令
        const metadata = mcpResponse.metadata || {};
        const cmdToExecute = metadata.command || command;
        
        // 发送命令到SSH
        logger.info(`Executing command via SSH: ${cmdToExecute}`);
        session.write(cmdToExecute + '\n');
        
        // 如果有解释，先显示
        if (mcpResponse.content && cmdToExecute !== command) {
          return {
            type: 'terminalResponse',
            timestamp: Date.now(),
            payload: {
              command,
              output: `${mcpResponse.content}\n执行命令: ${cmdToExecute}`,
              analysisType: 'enhanced_execution',
              path,
              success: true,
              showPrompt: false
            }
          };
        }
        
        // 没有特别解释，只发送命令
        return {
          type: 'commandSent',
          timestamp: Date.now(),
          payload: {
            command: cmdToExecute,
            originalCommand: command,
            aiEnhanced: cmdToExecute !== command,
            success: true
          }
        };
      } else {
        // 不应执行的命令，显示解释
        return {
          type: 'terminalResponse',
          timestamp: Date.now(),
          payload: {
            command,
            output: mcpResponse.content,
            analysisType: 'command_warning',
            path,
            success: false
          }
        };
      }
    } else {
      // 其他类型的响应
      return {
        type: 'terminalResponse',
        timestamp: Date.now(),
        payload: {
          command,
          output: mcpResponse.content,
          analysisType: mcpResponse.type,
          path,
          success: mcpResponse.success
        }
      };
    }
  } catch (error) {
    logger.error(`Error processing command through MCP: ${error}`);
    return {
      type: 'terminalResponse',
      timestamp: Date.now(),
      payload: {
        command,
        output: `处理命令出错: ${(error as Error).message}`,
        path,
        success: false
      }
    };
  }
}

/**
 * Update client conversation history
 */
function updateClientHistory(clientId: string, userCommand: string, aiResponse: string): void {
  // Get existing history or initialize new one
  let history = clientMessageHistory.get(clientId) || [];
  
  // Add new messages
  history.push({ role: 'user', content: userCommand });
  history.push({ role: 'assistant', content: aiResponse });
  
  // Keep history length limited
  if (history.length > MAX_HISTORY_LENGTH * 2) { // *2 because each exchange is 2 messages
    history = history.slice(-MAX_HISTORY_LENGTH * 2);
  }
  
  // Update history in the map
  clientMessageHistory.set(clientId, history);
}

/**
 * Clear client conversation history
 */
function clearClientHistory(clientId: string): void {
  clientMessageHistory.delete(clientId);
}

/**
 * Process SSH tab completion
 */
async function processTabCompletion(currentInput: string, clientId: string): Promise<any> {
  const sessionInfo = clientSshSessions.get(clientId);
  if (!sessionInfo || !sessionInfo.connected) {
    return {
      type: 'tabCompletionResponse',
      timestamp: Date.now(),
      payload: {
        success: false,
        message: 'No active SSH connection'
      }
    };
  }
  
  const session = sshService.getSession(sessionInfo.sessionId);
  if (!session) {
    clientSshSessions.delete(clientId);
    return {
      type: 'tabCompletionResponse',
      timestamp: Date.now(),
      payload: {
        success: false,
        message: 'SSH session not found or expired'
      }
    };
  }
  
  try {
    // For tab completion, we need to ensure the current input is in the shell's buffer
    // before we send the tab key
    const tabCompletionId = Date.now().toString();
    logger.info(`Tab补全请求 (ID=${tabCompletionId}): "${currentInput}"`);
    
    // 这个变量将存储最终的补全结果
    let completionResult = {
      originalInput: currentInput,
      completedInput: currentInput, // 默认保持不变
      options: [] as string[],      // 可能的补全选项
      found: false                  // 是否找到补全
    };
    
    // 先尝试清除当前行（使用Ctrl+U，十六进制:15）
    logger.debug(`清除当前行 (ID=${tabCompletionId})`);
    session.write('\u0015');
    
    // 延迟一小段时间，确保清行命令生效
    await new Promise(resolve => setTimeout(resolve, 30));
    
    // 然后写入当前输入
    logger.debug(`写入当前输入: "${currentInput}" (ID=${tabCompletionId})`);
    session.write(currentInput);
    
    // 再延迟一小段时间，确保输入已经被处理
    await new Promise(resolve => setTimeout(resolve, 30));
    
    // 最后发送Tab字符
    logger.debug(`发送Tab字符 (ID=${tabCompletionId})`);
    session.write('\t');
    
    // 添加一次性事件监听，捕获数据响应
    const dataPromise = new Promise<void>((resolve) => {
      let dataHandler: (data: string) => void;
      let responseBuffer = '';
      let receivedBell = false;
      
      dataHandler = (data: string) => {
        logger.info(`data:${data}`);
        const dataStr = data.toString();
        const hexData = Buffer.from(dataStr).toString('hex');
        responseBuffer += dataStr;
        
        logger.info(`Tab补全响应 (ID=${tabCompletionId}): 长度=${dataStr.length}, 响应内容="${dataStr.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}", 十六进制=${hexData}`);
        // 检查是否收到BEL字符（十六进制07），表示无补全选项
        if (dataStr.length <= 0) {
          logger.info(`收到BEL信号，没有找到匹配的补全项 (ID=${tabCompletionId})`);
          receivedBell = true;
          // 没有找到补全项，保持原输入不变
          completionResult = {
            ...completionResult,
            found: false
          };
          logger.debug('删除监听回调');
          session.removeListener('data', dataHandler);
          resolve();
        }
        else if (dataStr.trim().length > 0) {
          // SSH返回了有效的补全数据，如"aconda3/"
          logger.info(`接收到补全数据: "${dataStr}"`);
          
          // 提取原始输入的最后一个参数
          const lastSpaceIndex = currentInput.lastIndexOf(' ');
          const cmdBase = lastSpaceIndex >= 0 ? currentInput.substring(0, lastSpaceIndex + 1) : '';
          const lastParam = lastSpaceIndex >= 0 ? currentInput.substring(lastSpaceIndex + 1) : currentInput;
          
          logger.info(`命令基础部分: "${cmdBase}", 最后参数: "${lastParam}"`);
          
          // 简化逻辑：直接使用SSH返回的补全数据
          completionResult.completedInput = cmdBase + lastParam+dataStr;
          completionResult.found = true;
          logger.info(`补全结果: "${completionResult.completedInput}"`);
          
          logger.debug('处理完成，删除监听回调');
          session.removeListener('data', dataHandler);
          resolve();
        }
      };

      // 添加监听器
      session.on('data', dataHandler);
    });
    // 等待数据响应
    await dataPromise.catch(err => {
      logger.error(`监听Tab补全响应出错: ${err}`);
    });
    
    // 延迟一段时间，确保所有响应都被捕获
    await new Promise(resolve => setTimeout(resolve, 200));
    // 清理：再次清除当前行（使用Ctrl+U），以便前端可以重新显示完整内容
    session.write('\u0015');
    
    // 向前端返回补全结果
    logger.info(`Tab补全处理完成 (ID=${tabCompletionId}), 结果: ${JSON.stringify(completionResult)}`);
    
    // 向前端返回响应
    return {
      type: 'tabCompletionResponse',
      timestamp: Date.now(),
      payload: {
        success: true,
        completionResult,
        completionId: tabCompletionId
      }
    };
  } catch (error) {
    logger.error(`Error sending tab completion to SSH: ${error}`);
    return {
      type: 'tabCompletionResponse',
      timestamp: Date.now(),
      payload: {
        success: false,
        message: `Error processing tab completion: ${(error as Error).message}`
      }
    };
  }
}

/**
 * Create a WebSocket server
 */
export function createWebSocketServer(): WebSocketServer {
  logger.info(`Initializing WebSocket server on port ${config.ws.port}...`);
  
  const wss = new WebSocketServer({ 
    port: parseInt(config.ws.port as string, 10) 
  });

  // 服务器开始监听
  wss.on('listening', () => {
    logger.info(`WebSocket server started on port ${config.ws.port}`);
  });

  // 处理新的连接
  wss.on('connection', (ws: WebSocket, request: IncomingMessage) => {
    const clientId = request.headers['sec-websocket-key'] || `client-${Date.now()}`;
    const ip = request.socket.remoteAddress;
    
    clients.set(clientId, ws);
    
    logger.info(`Client connected: ${clientId} from ${ip}`);

    // 连接建立后立即发送欢迎消息
    try {
      const welcomeMessage = { 
        type: 'connected', 
        message: 'Connected to InfinityOps WebSocket server',
        timestamp: Date.now(),
        clientId: clientId
      };
      
      ws.send(JSON.stringify(welcomeMessage));
    } catch (error) {
      logger.error(`Error sending welcome message: ${error}`);
    }

    // 处理来自客户端的消息
    ws.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());
        logger.info(`Received message: type=${data.type} from ${clientId}`);
        
        // 处理不同类型的消息
        switch (data.type) {
          case 'ping':
            ws.send(JSON.stringify({ 
              type: 'pong', 
              timestamp: Date.now(),
              payload: { 
                pingReceived: Date.now(),
                clientId: clientId
              } 
            }));
            break;
          
          case 'terminalCommand':
            // 处理终端命令
            if (data.payload && data.payload.command) {
              const { command, path = '~' } = data.payload;
              logger.info(`Terminal command received: ${command}`);
              
              try {
                // Process through AI instead of direct execution
                const response = await processCommandWithAI(command, path, clientId);
                ws.send(JSON.stringify(response));
              } catch (cmdError) {
                logger.error(`Failed to process terminal command: ${cmdError}`);
                ws.send(JSON.stringify({
                  type: 'terminalResponse',
                  timestamp: Date.now(),
                  payload: {
                    command,
                    output: `Error processing command: ${(cmdError as Error).message}`,
                    path,
                    success: false
                  }
                }));
              }
            } else {
              logger.warn('Invalid terminal command format');
              ws.send(JSON.stringify({
                type: 'terminalResponse',
                timestamp: Date.now(),
                payload: {
                  output: 'Invalid command format',
                  success: false
                }
              }));
            }
            break;
            
          case 'clearHistory':
            // Clear conversation history for this client
            clearClientHistory(clientId);
            ws.send(JSON.stringify({
              type: 'historyCleared',
              timestamp: Date.now(),
              payload: {
                success: true
              }
            }));
            break;
            
          case 'sshPasswordAuth':
            if (data.payload && data.payload.password) {
              const sessionInfo = clientSshSessions.get(clientId);
              if (!sessionInfo) {
                ws.send(JSON.stringify({
                  type: 'terminalResponse',
                  timestamp: Date.now(),
                  payload: {
                    output: 'No pending SSH connection request',
                    success: false
                  }
                }));
                break;
              }
                
              const { host, port, username } = data.payload;
              const config: SSHConnectionConfig = {
                host,
                port,
                username,
                password: data.payload.password
              };
                
              try {
                const response = await completeSshConnection(clientId, config);
                ws.send(JSON.stringify(response));
              } catch (error) {
                ws.send(JSON.stringify({
                  type: 'terminalResponse',
                  timestamp: Date.now(),
                  payload: {
                    output: `SSH connection failed: ${(error as Error).message}`,
                    success: false
                  }
                }));
              }
            }
            break;
            
          case 'sshResize':
            if (data.payload && data.payload.rows && data.payload.cols) {
              const sessionInfo = clientSshSessions.get(clientId);
              if (sessionInfo && sessionInfo.connected) {
                const session = sshService.getSession(sessionInfo.sessionId);
                if (session) {
                  session.resize(data.payload.rows, data.payload.cols);
                }
              }
            }
            break;
            
          case 'sshSignal':
            // 处理SSH信号，如Ctrl+C (SIGINT)
            if (data.payload && data.payload.signal && data.payload.sessionId) {
              logger.info(`SSH signal received: ${data.payload.signal} for session ${data.payload.sessionId}`);
              
              try {
                const session = sshService.getSession(data.payload.sessionId);
                if (!session) {
                  logger.warn(`SSH session not found: ${data.payload.sessionId}`);
                  break;
                }
                
                // 处理不同类型的信号
                switch (data.payload.signal) {
                  case 'SIGINT': // Ctrl+C
                    logger.info(`Sending Ctrl+C to SSH session ${data.payload.sessionId}`);
                    // 发送 ASCII 3 (ETX - End of Text，即Ctrl+C)
                    session.write('\x03');
                    break;
                    
                  case 'SIGTSTP': // Ctrl+Z
                    logger.info(`Sending Ctrl+Z to SSH session ${data.payload.sessionId}`);
                    // 发送 ASCII 26 (SUB - Substitute，即Ctrl+Z)
                    session.write('\x1A');
                    break;
                    
                  default:
                    logger.warn(`Unsupported SSH signal: ${data.payload.signal}`);
                }
              } catch (error) {
                logger.error(`Error sending signal to SSH session: ${error}`);
              }
            } else {
              logger.warn('Invalid SSH signal format');
            }
            break;
            
          case 'sshDisconnect':
            const sessionInfo = clientSshSessions.get(clientId);
            if (sessionInfo && sessionInfo.sessionId) {
              await sshService.closeSession(sessionInfo.sessionId);
              clientSshSessions.delete(clientId);
              ws.send(JSON.stringify({
                type: 'sshDisconnected',
                timestamp: Date.now(),
                payload: {
                  message: 'SSH connection closed'
                }
              }));
            }
            break;
            
          case 'tabCompletion':
            // Handle tab completion requests - bypass AI processing
            if (data.payload && data.payload.currentInput !== undefined) {
              const { currentInput } = data.payload;
              logger.info(`Tab completion requested for: "${currentInput}"`);
              
              try {
                // Process tab completion directly
                const response = await processTabCompletion(currentInput, clientId);
                ws.send(JSON.stringify(response));
              } catch (tabError) {
                logger.error(`Failed to process tab completion: ${tabError}`);
                ws.send(JSON.stringify({
                  type: 'tabCompletionResponse',
                  timestamp: Date.now(),
                  payload: {
                    success: false,
                    message: `Error: ${(tabError as Error).message}`
                  }
                }));
              }
            } else {
              logger.warn('Invalid tab completion format');
              ws.send(JSON.stringify({
                type: 'tabCompletionResponse',
                timestamp: Date.now(),
                payload: {
                  success: false,
                  message: 'Invalid tab completion request format'
                }
              }));
            }
            break;
            
          // 添加更多消息类型处理
          default:
            logger.warn(`Unknown message type: "${data.type}"`);
        }
      } catch (error) {
        logger.error(`Error processing message: ${error}`);
        // 尝试发送错误响应
        try {
          ws.send(JSON.stringify({ 
            type: 'error', 
            message: 'Failed to process message',
            error: (error as Error).message,
            timestamp: Date.now() 
          }));
        } catch (sendError) {
          logger.error(`Failed to send error response: ${sendError}`);
        }
      }
    });

    // 处理客户端断开连接
    ws.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason.toString() || 'No reason provided';
      logger.info(`Client disconnected: ${clientId}, code: ${code}`);
      clients.delete(clientId);
      
      // Clean up client history when disconnected
      clearClientHistory(clientId);
    });

    // 处理连接错误
    ws.on('error', (error) => {
      logger.error(`WebSocket error for client ${clientId}: ${error}`);
      try {
        ws.close(1011, 'Internal server error');
      } catch (closeError) {
        // 静默处理关闭错误
      }
    });
  });

  // 处理服务器错误
  wss.on('error', (error) => {
    logger.error(`WebSocket server error: ${error.toString()}`);
  });

  // 处理服务器关闭
  wss.on('close', () => {
    logger.info('WebSocket server closed');
    clients.clear();
    
    // Clear all client histories
    clientMessageHistory.clear();
  });

  return wss;
}

/**
 * Broadcast a message to all connected clients
 */
export function broadcastMessage(message: any): void {
  const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
  logger.info(`Broadcasting message to ${clients.size} clients`);
  
  let successCount = 0;
  let failCount = 0;
  
  clients.forEach((client, id) => {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(messageStr);
        successCount++;
      } catch (error) {
        logger.error(`Failed to send broadcast to client ${id}: ${error}`);
        failCount++;
      }
    } else {
      failCount++;
    }
  });
  
  if (failCount > 0) {
    logger.info(`Broadcast results: ${successCount} successful, ${failCount} failed`);
  }
}

/**
 * Send a message to a specific client
 */
export function sendToClient(clientId: string, message: any): boolean {
  const client = clients.get(clientId);
  const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
  
  if (!client) {
    logger.warn(`Cannot send message: client ${clientId} not found`);
    return false;
  }
  
  if (client.readyState !== WebSocket.OPEN) {
    logger.warn(`Cannot send message: connection not open`);
    return false;
  }
  
  try {
    client.send(messageStr);
    return true;
  } catch (error) {
    logger.error(`Error sending message: ${error}`);
    return false;
  }
}

/**
 * Get the number of connected clients
 */
export function getConnectedClientsCount(): number {
  return clients.size;
}

/**
 * Get all connected client IDs
 */
export function getConnectedClientIds(): string[] {
  return Array.from(clients.keys());
} 