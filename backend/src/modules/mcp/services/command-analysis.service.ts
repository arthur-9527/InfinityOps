import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { MCPRequestContext, MCPResponse } from '../interfaces/mcp.interface';
import { RemoteMCPConfig, RemoteMCPService, RemoteMCPStatus } from '../interfaces/remote-mcp.interface';
import { BaseMCPService } from './base-mcp.service';
import { createModuleLogger } from '../../../utils/logger';

/**
 * RemoteCommandAnalysisService - Service for connecting to remote MCP command analysis servers
 * 
 * This service allows InfinityOps to connect to external command analysis services
 * via HTTP/HTTPS API endpoints.
 */
export class RemoteCommandAnalysisService extends BaseMCPService implements RemoteMCPService {
  // MCP Service interface properties
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly priority: number;
  readonly isSystemService: boolean = false;
  
  // Remote MCP specific properties
  readonly config: RemoteMCPConfig;
  private axiosInstance: AxiosInstance = axios.create();
  private status: RemoteMCPStatus = {
    available: false,
    lastChecked: new Date()
  };
  
  constructor(
    id: string,
    name: string,
    description: string,
    priority: number = 50,
    config: RemoteMCPConfig
  ) {
    super();
    this.id = id || `remote-command-analysis-${Date.now()}`;
    this.name = name || '远程命令分析服务';
    this.description = description || '通过API连接到远程命令分析服务器';
    this.priority = priority;
    this.config = this.normalizeConfig(config);
    
    // Initialize logger
    this.logger = createModuleLogger(`remote-mcp-${this.id}`);
    
    // Initialize axios instance
    this.initializeAxiosInstance();
  }
  
  /**
   * Initialize the service
   */
  async initialize(): Promise<void> {
    await super.initialize();
    
    this.logger.info(`Initializing remote MCP service: ${this.name}`);
    this.logger.info(`Remote MCP URL: ${this.config.url}`);
    
    // Test the connection
    try {
      const available = await this.testConnection();
      if (available) {
        this.logger.info(`Successfully connected to remote MCP server: ${this.config.url}`);
      } else {
        this.logger.warn(`Failed to connect to remote MCP server: ${this.config.url}`);
      }
    } catch (error) {
      this.logger.error(`Error connecting to remote MCP server: ${error}`);
      this.status = {
        available: false,
        lastChecked: new Date(),
        error: (error as Error).message
      };
    }
  }
  
  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    await super.shutdown();
    this.logger.info(`Shutting down remote MCP service: ${this.name}`);
  }
  
  /**
   * Check if this service can handle the given request
   */
  async canHandle(context: MCPRequestContext): Promise<number> {
    // Check if service is available
    if (!this.status.available) {
      await this.updateStatus();
      if (!this.status.available) {
        return 0; // Cannot handle if remote service is unavailable
      }
    }
    
    try {
      // Call the remote API to check if it can handle this request
      const response = await this.axiosInstance.post('/api/can-handle', {
        context
      });
      
      // Return the confidence score from the remote service
      return response.data.score || 0;
    } catch (error) {
      this.logger.error(`Error checking if remote MCP can handle request: ${error}`);
      // Update status if there was an error
      this.status.available = false;
      this.status.lastChecked = new Date();
      this.status.error = (error as Error).message;
      return 0;
    }
  }
  
  /**
   * Process the request using the remote MCP server
   */
  async process(context: MCPRequestContext): Promise<MCPResponse> {
    // Check if service is available
    if (!this.status.available) {
      await this.updateStatus();
      if (!this.status.available) {
        return this.createErrorResponse(`远程MCP服务器不可用: ${this.status.error || '未知错误'}`);
      }
    }
    
    try {
      // Call the remote API to process the request
      const response = await this.axiosInstance.post('/api/process', {
        context
      });
      
      // Validate and return the response
      if (this.isValidMCPResponse(response.data)) {
        return response.data;
      } else {
        this.logger.error(`Invalid response from remote MCP server: ${JSON.stringify(response.data)}`);
        return this.createErrorResponse('远程MCP服务器返回了无效的响应格式');
      }
    } catch (error) {
      this.logger.error(`Error processing request with remote MCP: ${error}`);
      // Update status if there was an error
      this.status.available = false;
      this.status.lastChecked = new Date();
      this.status.error = (error as Error).message;
      return this.createErrorResponse(`处理请求时出错: ${(error as Error).message}`);
    }
  }
  
  /**
   * Handle confirmation responses via the remote MCP server
   */
  async handleConfirmation(context: MCPRequestContext, isConfirmed: boolean): Promise<MCPResponse> {
    // Check if service is available
    if (!this.status.available) {
      await this.updateStatus();
      if (!this.status.available) {
        return this.createErrorResponse(`远程MCP服务器不可用: ${this.status.error || '未知错误'}`);
      }
    }
    
    try {
      // Call the remote API to handle the confirmation
      const response = await this.axiosInstance.post('/api/handle-confirmation', {
        context,
        isConfirmed
      });
      
      // Validate and return the response
      if (this.isValidMCPResponse(response.data)) {
        return response.data;
      } else {
        this.logger.error(`Invalid response from remote MCP server: ${JSON.stringify(response.data)}`);
        return this.createErrorResponse('远程MCP服务器返回了无效的响应格式');
      }
    } catch (error) {
      this.logger.error(`Error handling confirmation with remote MCP: ${error}`);
      // Update status if there was an error
      this.status.available = false;
      this.status.lastChecked = new Date();
      this.status.error = (error as Error).message;
      return this.createErrorResponse(`处理确认时出错: ${(error as Error).message}`);
    }
  }
  
  /**
   * Get the current status of the remote MCP server
   */
  async getStatus(): Promise<RemoteMCPStatus> {
    await this.updateStatus();
    return this.status;
  }
  
  /**
   * Update the configuration for the remote MCP server
   */
  async updateConfig(config: Partial<RemoteMCPConfig>): Promise<void> {
    // Update the config
    this.config.url = config.url || this.config.url;
    this.config.apiKey = config.apiKey || this.config.apiKey;
    this.config.timeout = config.timeout || this.config.timeout;
    this.config.maxRetries = config.maxRetries || this.config.maxRetries;
    this.config.secure = config.secure !== undefined ? config.secure : this.config.secure;
    this.config.headers = { ...this.config.headers, ...config.headers };
    this.config.verifySsl = config.verifySsl !== undefined ? config.verifySsl : this.config.verifySsl;
    
    // Reinitialize the axios instance with the new config
    this.initializeAxiosInstance();
    
    // Test the connection with the new config
    await this.testConnection();
    
    this.logger.info(`Updated remote MCP configuration for ${this.name}`);
  }
  
  /**
   * Test the connection to the remote MCP server
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.axiosInstance.get('/api/status', {
        timeout: this.config.timeout || 5000
      });
      
      // Update the status
      this.status = {
        available: response.status === 200,
        version: response.data.version,
        lastChecked: new Date()
      };
      
      return this.status.available;
    } catch (error) {
      this.logger.error(`Error testing connection to remote MCP server: ${error}`);
      
      // Update the status
      this.status = {
        available: false,
        lastChecked: new Date(),
        error: (error as Error).message
      };
      
      return false;
    }
  }
  
  // Private utility methods
  
  /**
   * Initialize the axios instance for API requests
   */
  private initializeAxiosInstance(): void {
    const baseURL = this.config.url;
    
    // Create the axios config
    const axiosConfig: AxiosRequestConfig = {
      baseURL,
      timeout: this.config.timeout || 10000,
      headers: {
        'Content-Type': 'application/json',
        ...this.config.headers
      }
    };
    
    // Add API key if provided
    if (this.config.apiKey) {
      axiosConfig.headers = {
        ...axiosConfig.headers,
        'X-API-Key': this.config.apiKey
      };
    }
    
    // Create the axios instance
    this.axiosInstance = axios.create(axiosConfig);
    
    // Add request interceptor for logging
    this.axiosInstance.interceptors.request.use((config) => {
      this.logger.debug(`Sending request to ${config.url}`);
      return config;
    });
    
    // Add response interceptor for logging
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.logger.debug(`Received response from ${response.config.url}: ${response.status}`);
        return response;
      },
      (error) => {
        if (error.response) {
          this.logger.error(`Error response from remote MCP: ${error.response.status} ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          this.logger.error(`No response from remote MCP: ${error.message}`);
        } else {
          this.logger.error(`Error setting up request to remote MCP: ${error.message}`);
        }
        return Promise.reject(error);
      }
    );
  }
  
  /**
   * Normalize the provided config to ensure required fields are present
   */
  private normalizeConfig(config: RemoteMCPConfig): RemoteMCPConfig {
    return {
      url: config.url,
      apiKey: config.apiKey,
      timeout: config.timeout || 10000,
      maxRetries: config.maxRetries || 3,
      secure: config.secure !== undefined ? config.secure : true,
      headers: config.headers || {},
      verifySsl: config.verifySsl !== undefined ? config.verifySsl : true
    };
  }
  
  /**
   * Update the current status of the remote MCP server
   */
  private async updateStatus(): Promise<void> {
    // If we've checked in the last minute, don't check again
    const now = new Date();
    if (this.status.lastChecked && 
        now.getTime() - this.status.lastChecked.getTime() < 60000) {
      return;
    }
    
    // Test the connection
    await this.testConnection();
  }
  
  /**
   * Validate that a response from the remote server matches the MCPResponse interface
   */
  private isValidMCPResponse(response: any): response is MCPResponse {
    return (
      response &&
      typeof response === 'object' &&
      typeof response.type === 'string' &&
      typeof response.content === 'string' &&
      typeof response.success === 'boolean'
    );
  }
} 