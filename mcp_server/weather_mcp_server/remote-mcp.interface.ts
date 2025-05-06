/**
 * 远程MCP服务接口定义
 * 
 * 此文件定义了用于与InfinityOps系统交互的MCP服务器所需的接口规范
 */

// MCP请求上下文
export interface MCPRequestContext {
  sessionId: string;
  userId?: string;
  requestId: string;
  input: string;
  path?: string;
  timestamp: number;
  additionalContext?: Record<string, any>;
}

// MCP响应
export interface MCPResponse {
  type: string;        // 响应类型: 'info', 'error', 'warning', 'success'等
  content: string;     // 响应内容，通常是文本消息
  success: boolean;    // 请求是否成功处理
  metadata?: Record<string, any>; // 附加信息
  shouldProcess?: boolean;        // 是否需要进一步处理
  requireConfirmation?: boolean;  // 是否需要用户确认
  confirmationMessage?: string;   // 确认消息
  isAwaitingConfirmation?: boolean; // 是否正在等待确认
}

// 能力检查响应
export interface CanHandleResponse {
  score: number; // 0-1的置信度分数
}

// 服务器状态响应
export interface StatusResponse {
  status: string;           // 服务器状态
  version: string;          // 服务器版本
  capabilities: string[];   // 服务器能力
  uptime?: number;          // 运行时间（秒）
  requestsProcessed?: number; // 已处理请求数
}

// 确认请求
export interface ConfirmationRequest {
  context: MCPRequestContext;
  isConfirmed: boolean; // 用户是否确认
}

// 请求包装器
export interface MCPRequest {
  context: MCPRequestContext;
}

// 中国天气查询特有的接口
export interface WeatherQueryParams {
  city: string;      // 城市名称
  province?: string; // 省份名称
  district?: string; // 区县名称
}

// 天气信息响应
export interface WeatherInfo {
  city: string;         // 城市
  date: string;         // 日期
  weather: string;      // 天气状况
  temperature: {        // 温度
    current?: number;   // 当前温度
    low: number;        // 最低温度
    high: number;       // 最高温度
  };
  humidity?: number;    // 湿度
  windDirection?: string; // 风向
  windForce?: string;   // 风力
  airQuality?: {        // 空气质量
    aqi: number;        // 空气质量指数
    level: string;      // 等级
    description: string; // 描述
  };
  advice?: string;      // 建议
  warning?: string;     // 警告
} 