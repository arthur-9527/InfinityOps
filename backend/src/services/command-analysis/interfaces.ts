/**
 * 命令分析模块接口定义文件
 * 定义命令分析服务的数据结构和接口类型
 */

// 终端状态类型
export type TerminalState = 'normal' | 'interactive' | 'config';

// 命令类型枚举
export enum CommandType {
  BASIC = 'basic',
  INTERACTIVE = 'interactive',
  MCP = 'mcp',
  INVALID = 'invalid'
}

// MCP服务类型
export type MCPServiceName = 'fileManager' | 'systemInfo' | 'toolRunner' | 'scriptManager' | string;

// MCP服务信息接口
export interface MCPServiceInfo {
  // MCP服务名称
  serviceName: MCPServiceName;
  
  // 服务唯一标识符
  serviceId?: string;
  
  // 服务参数
  params?: Record<string, any>;
  
  // 优先级（1-10，数值越小优先级越高）
  priority?: number;
}

// 命令分析结果接口
export interface CommandAnalysisResult {
  // 命令类型
  commandType: CommandType;
  
  // 是否应该执行命令
  shouldExecute: boolean;
  
  // 是否应该改变终端状态
  shouldChangeTerminalState: boolean;
  
  // 新的终端状态
  newTerminalState: TerminalState;
  
  // 修改后的命令（可能与原始命令相同）
  modifiedCommand: string;
  
  // 命令解释或建议
  explanation: string;
  
  // 用户反馈信息
  feedback: {
    // 是否需要向用户提供反馈
    needsFeedback: boolean;
    
    // 反馈消息
    message: string;
  };
  
  // 命令分析详情
  analysis: {
    // 命令的目的
    commandPurpose: string;
    
    // 潜在问题列表
    potentialIssues: string[];
    
    // 替代命令列表
    alternatives: string[];
  };
  
  // MCP服务信息（仅当commandType为MCP时才有）
  mcpInfo?: MCPServiceInfo;
}

// 命令分析请求参数接口
export interface CommandAnalysisParams {
  // 原始命令
  command: string;
  
  // 当前终端状态
  currentTerminalState: TerminalState;
  
  // 操作系统信息
  osInfo?: {
    platform: string;
    distribution?: string;
    version?: string;
  };
  
  // 会话ID（用于上下文关联）
  sessionId?: string;
}

// 命令分析服务接口
export interface ICommandAnalysisService {
  /**
   * 分析命令
   * @param params 命令分析参数
   * @returns 命令分析结果
   */
  analyzeCommand(params: CommandAnalysisParams): Promise<CommandAnalysisResult>;
  
  /**
   * 判断命令是否属于bypass列表
   * @param command 要判断的命令
   * @returns 如果命令在bypass列表中返回true，否则返回false
   */
  isCommandInBypassList(command: string): boolean;
  
  /**
   * 加载配置
   * 从.env文件读取配置项
   */
  loadConfig(): void;
}

// 命令跳过模式枚举
export enum CommandBypassMode {
  NONE = 'none',     // 所有命令都经过AI分析
  COMMON = 'common', // 常用命令跳过AI分析
  ALL = 'all'        // 所有命令都跳过AI分析
}

// 配置接口
export interface CommandAnalysisConfig {
  // 命令跳过模式
  bypassMode: CommandBypassMode;
  
  // 跳过分析的命令列表
  bypassCommands: string[];
  
  // AI提供商
  aiProvider: string;
  
  // AI模型
  aiModel: string;
}

// 命令提示接口
export interface CommandPrompt {
  system: string;
  instructions: string;
  commandTypes: Record<string, string>;
  rules: Record<string, string>;
  formatInstructions: string;
  examples: Array<{
    input: {
      command: string;
      currentTerminalState: string;
      osInfo: {
        platform: string;
        distribution?: string;
        version?: string;
      };
    };
    output: CommandAnalysisResult;
  }>;
} 