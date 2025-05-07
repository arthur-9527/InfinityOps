/**
 * 命令分析模块入口文件
 * 导出命令分析服务相关类、接口和实例
 */

// 导出命令分析服务
export { 
  CommandAnalysisService, 
  commandAnalysisService 
} from './service';

// 导出接口定义
export {
  CommandType,
  type TerminalState,
  type CommandAnalysisResult,
  type CommandAnalysisParams,
  type ICommandAnalysisService,
  type MCPServiceInfo,
  CommandBypassMode,
  type CommandAnalysisConfig,
  type CommandPrompt
} from './interfaces';

// 导出工具函数
export {
  DEFAULT_INVALID_COMMAND_RESULT,
  createBasicCommandResult,
  createMCPCommandResult,
  createInteractiveCommandResult
} from './utils'; 