import { Request, Response, NextFunction } from 'express';
import { redisClient } from '../services/redisService';
import { v4 as uuidv4 } from 'uuid';

interface RedisLoggerRequest extends Request {
  sessionId?: string;
}

// 获取所有输入缓存
async function getInputCache(sessionId: string): Promise<string[]> {
  try {
    const key = `session:input:${sessionId}`;
    const length = await redisClient.lLen(key);
    if (length === 0) return [];
    return await redisClient.lRange(key, 0, -1);
  } catch (err) {
    console.error(`[Redis Logger] Error getting input cache for session ${sessionId}:`, err);
    return [];
  }
}

// 清空输入缓存
async function clearInputCache(sessionId: string): Promise<void> {
  try {
    const key = `session:input:${sessionId}`;
    await redisClient.del(key);
    console.log(`[Redis Logger] Cleared input cache for session ${sessionId}`);
  } catch (err) {
    console.error(`[Redis Logger] Error clearing input cache for session ${sessionId}:`, err);
  }
}

// 保存命令历史
async function saveCommandHistory(sessionId: string, command: string): Promise<void> {
  try {
    const key = `session:history:${sessionId}`;
    const logData = {
      timestamp: Date.now(),
      command: command
    };
    await redisClient.lPush(key, JSON.stringify(logData));
    console.log(`[Redis Logger] Saved command history for session ${sessionId}:`, logData);
  } catch (err) {
    console.error(`[Redis Logger] Error saving command history for session ${sessionId}:`, err);
  }
}

// WebSocket消息记录函数
export const logWebSocketMessage = async (sessionId: string, type: 'input' | 'output', data: any) => {
  try {
    const logData = {
      timestamp: Date.now(),
      data: data
    };
    
    const key = `session:${type}:${sessionId}`;
    await redisClient.lPush(key, JSON.stringify(logData));
    console.log(`[Redis Logger] Stored ${type} for session ${sessionId}:`, logData);
  } catch (err) {
    console.error(`[Redis Logger] Error storing ${type} for session ${sessionId}:`, err);
  }
};

// 处理SSH原始输入
export const logSshRawInput = async (sessionId: string, data: string): Promise<string | null> => {
  try {
    const charCode = data.charCodeAt(0);
    const key = `session:input:${sessionId}`;
    
    // 处理Tab键 (ASCII 9)
    if (charCode === 9) {
      console.log(`[Redis Logger] Received Tab for session ${sessionId}, setting tab flag`);
      await redisClient.set(`session:tab:${sessionId}`, '1');
      return null;
    }
    
    // 处理Ctrl+C (ASCII 3)
    if (charCode === 3) {
      console.log(`[Redis Logger] Received Ctrl+C for session ${sessionId}, clearing input cache`);
      await redisClient.del(key);
      await redisClient.del(`session:tab:${sessionId}`);
      return null;
    }
    
    // 处理退格键 (ASCII 127)
    if (charCode === 127) {
      const inputs = await redisClient.lRange(key, 0, -1);
      if (inputs.length > 0) {
        try {
          // 获取所有输入并组合成一个字符串
          const combinedInput = inputs
            .map(input => JSON.parse(input).data.data)
            .reverse()
            .join('');
          
          if (combinedInput.length > 0) {
            // 移除最后一个字符
            const newInput = combinedInput.slice(0, -1);
            
            // 清空当前缓存
            await redisClient.del(key);
            
            // 如果还有剩余字符，重新存储
            if (newInput.length > 0) {
              await logWebSocketMessage(sessionId, 'input', {
                type: 'raw_input',
                data: newInput
              });
            }
            
            console.log(`[Redis Logger] Removed last character for session ${sessionId}, new input: ${newInput}`);
          }
        } catch (err) {
          console.error(`[Redis Logger] Error processing backspace for session ${sessionId}:`, err);
        }
      }
      return null;
    }
    
    // 处理回车键 (ASCII 13)
    if (charCode === 13) {
      const lastInput = await redisClient.lIndex(key, 0); // 获取最新的输入
      if (lastInput) {
        try {
          const lastInputData = JSON.parse(lastInput);
          // 检查最后一个字符是否为反斜杠
          if (lastInputData.data.data.endsWith('\\')) {
            console.log(`[Redis Logger] Command continuation detected for session ${sessionId}`);
            return null; // 命令未完成，不做处理
          }
          
          // 命令完成，获取所有输入并组合
          const inputs = await redisClient.lRange(key, 0, -1);
          const command = inputs
            .map(input => JSON.parse(input).data.data)
            .reverse() // 反转数组以保持正确的顺序
            .join('');
            
          // 保存到命令历史
          await redisClient.lPush(`session:history:${sessionId}`, JSON.stringify({
            timestamp: Date.now(),
            command: command
          }));

          // 清空输入缓存和tab标志
          await redisClient.del(key);
          await redisClient.del(`session:tab:${sessionId}`);
          console.log(`[Redis Logger] Command completed for session ${sessionId}: ${command}`);
          return command;
        } catch (err) {
          console.error(`[Redis Logger] Error processing command for session ${sessionId}:`, err);
        }
      }
      return null;
    }
    
    // 只记录非特殊字符的输入
    if (data.length > 1 || (charCode >= 32 && charCode <= 126)) {
      await logWebSocketMessage(sessionId, 'input', {
        type: 'raw_input',
        data: data
      });
    }
    return null;
  } catch (err) {
    console.error(`[Redis Logger] Error processing raw input for session ${sessionId}:`, err);
    return null;
  }
};

// 处理SSH输出
export const logSshOutput = async (sessionId: string, data: string) => {
  try {
    // 检查是否有tab补全标志
    const tabFlag = await redisClient.get(`session:tab:${sessionId}`);
    if (tabFlag === '1') {
      // 清除tab标志
      await redisClient.del(`session:tab:${sessionId}`);
      
      // 检查输出是否有效（不是以\n开头）
      if (data && !data.startsWith('\n')) {
        // 将输出添加到输入缓存
        await logWebSocketMessage(sessionId, 'input', {
          type: 'raw_input',
          data: data
        });
        console.log(`[Redis Logger] Added tab completion output to input cache for session ${sessionId}: ${data}`);
      }
    }
    
    // 记录输出
    await logWebSocketMessage(sessionId, 'output', {
      type: 'ssh_output',
      data: data
    });
  } catch (err) {
    console.error(`[Redis Logger] Error processing SSH output for session ${sessionId}:`, err);
  }
};

export const redisLogger = async (req: RedisLoggerRequest, res: Response, next: NextFunction) => {
  // 生成或获取会话ID
  if (!req.sessionId) {
    req.sessionId = uuidv4();
  }

  // 获取原始响应方法
  const originalSend = res.send;
  const originalWrite = res.write;
  const originalEnd = res.end;

  // 重写 res.send 方法
  res.send = function (body: any): Response {
    // 记录输出
    if (body && typeof body === 'object' && body.output) {
      logSshOutput(req.sessionId!, body.output);
    }
    return originalSend.call(this, body);
  };

  // 重写 res.write 方法
  res.write = function (chunk: any): boolean {
    // 记录输出
    if (chunk && typeof chunk === 'string') {
      try {
        const data = JSON.parse(chunk);
        if (data.output) {
          logSshOutput(req.sessionId!, data.output);
        }
      } catch (e) {
        // 如果不是JSON格式，直接记录原始数据
        logSshOutput(req.sessionId!, chunk.toString());
      }
    }
    return originalWrite.call(this, chunk, 'utf8');
  };

  // 重写 res.end 方法
  res.end = function (chunk?: any): Response {
    if (chunk) {
      // 记录最后的输出
      if (typeof chunk === 'string') {
        try {
          const data = JSON.parse(chunk);
          if (data.output) {
            logSshOutput(req.sessionId!, data.output);
          }
        } catch (e) {
          logSshOutput(req.sessionId!, chunk.toString());
        }
      }
    }
    return originalEnd.call(this, chunk, 'utf8');
  };

  // 记录输入命令
  if (req.body && req.body.command) {
    const command = req.body.command;
    // 只记录非特殊按键的命令（排除Ctrl+C等特殊按键）
    if (command.length > 1 || (command.charCodeAt(0) >= 32 && command.charCodeAt(0) <= 126)) {
      if (req.sessionId) {
        logSshRawInput(req.sessionId, command);
      }
    }
  }

  next();
};

// 清理过期会话的Redis数据
export const cleanupSession = async (sessionId: string) => {
  try {
    await redisClient.del(`session:input:${sessionId}`);
    await redisClient.del(`session:output:${sessionId}`);
    console.log(`[Redis Logger] Cleaned up session data for session ${sessionId}`);
  } catch (error) {
    console.error(`[Redis Logger] Error cleaning up session data for session ${sessionId}:`, error);
  }
}; 