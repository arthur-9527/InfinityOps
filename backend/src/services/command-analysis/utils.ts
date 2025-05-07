/**
 * 命令分析工具函数
 */
import { CommandType, CommandAnalysisResult, MCPServiceInfo, TerminalState } from './interfaces';

/**
 * 默认AI分析命令的结果（命令无效时使用）
 */
export const DEFAULT_INVALID_COMMAND_RESULT: CommandAnalysisResult = {
  commandType: CommandType.INVALID,
  shouldExecute: false,
  shouldChangeTerminalState: false,
  newTerminalState: 'normal',
  modifiedCommand: '',
  explanation: '无法解析命令',
  feedback: {
    needsFeedback: true,
    message: '命令解析失败，请重试或检查命令是否正确。'
  },
  analysis: {
    commandPurpose: '未知',
    potentialIssues: ['命令解析失败'],
    alternatives: []
  }
};

/**
 * 创建基本命令的分析结果（无需AI分析的命令使用）
 * @param command 命令
 * @returns 命令分析结果
 */
export function createBasicCommandResult(command: string): CommandAnalysisResult {
  return {
    commandType: CommandType.BASIC,
    shouldExecute: true,
    shouldChangeTerminalState: false,
    newTerminalState: 'normal',
    modifiedCommand: command,
    explanation: `执行命令: ${command}`,
    feedback: {
      needsFeedback: false,
      message: ''
    },
    analysis: {
      commandPurpose: '执行Shell命令',
      potentialIssues: [],
      alternatives: []
    }
  };
}

/**
 * 创建MCP命令的分析结果
 * @param command 命令
 * @param mcpInfo MCP服务信息
 * @returns 命令分析结果
 */
export function createMCPCommandResult(command: string, mcpInfo: MCPServiceInfo): CommandAnalysisResult {
  return {
    commandType: CommandType.MCP,
    shouldExecute: true,
    shouldChangeTerminalState: false,
    newTerminalState: 'normal',
    modifiedCommand: command,
    explanation: `通过MCP服务"${mcpInfo.serviceName}"执行命令: ${command}`,
    feedback: {
      needsFeedback: false,
      message: ''
    },
    analysis: {
      commandPurpose: '执行本地MCP操作',
      potentialIssues: [],
      alternatives: []
    },
    mcpInfo
  };
}

/**
 * 创建交互式命令分析结果
 * @param command 命令
 * @returns 命令分析结果
 */
export function createInteractiveCommandResult(command: string): CommandAnalysisResult {
  return {
    commandType: CommandType.INTERACTIVE,
    shouldExecute: true,
    shouldChangeTerminalState: true,
    newTerminalState: 'interactive',
    modifiedCommand: command,
    explanation: `执行交互式命令: ${command}`,
    feedback: {
      needsFeedback: false,
      message: ''
    },
    analysis: {
      commandPurpose: '启动交互式环境',
      potentialIssues: [],
      alternatives: []
    }
  };
} 