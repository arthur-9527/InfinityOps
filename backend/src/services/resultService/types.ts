/**
 * 分析结果类型
 */
export type AnalysisType = 'success' | 'error' | 'info' | 'warning';

/**
 * 分析结果接口
 */
export interface AnalysisResult {
  type: AnalysisType;
  data: string | null;
  details: string;
}

/**
 * AI输出记录接口
 */
export interface AiOutputRecord {
  type: 'analysis' | 'command' | 'weather' | 'other';
  result: AnalysisResult;
  timestamp?: number;
}

/**
 * 分析选项接口
 */
export interface AnalysisOptions {
  includeOriginalOutput?: boolean;
  maxSuggestions?: number;
  customPrompt?: string;
} 