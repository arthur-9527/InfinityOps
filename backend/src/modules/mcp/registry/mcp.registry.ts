import { MCPRequestContext, MCPResponse, MCPService } from '../interfaces/mcp.interface';
import { createModuleLogger } from '../../../utils/logger';

const logger = createModuleLogger('mcp-registry');

/**
 * MCPRegistry is responsible for managing all MCP services and routing
 * requests to the appropriate service based on their capabilities.
 */
export class MCPRegistry {
  private static instance: MCPRegistry;
  private services: Map<string, MCPService> = new Map();
  private initialized = false;
  private pendingConfirmations: Map<string, { service: MCPService, context: MCPRequestContext }> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance of the MCPRegistry
   */
  public static getInstance(): MCPRegistry {
    if (!MCPRegistry.instance) {
      MCPRegistry.instance = new MCPRegistry();
    }
    return MCPRegistry.instance;
  }

  /**
   * Initialize all registered services
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info(`Initializing MCP Registry with ${this.services.size} services`);
    
    // Initialize all services in parallel
    const initPromises = Array.from(this.services.values()).map(async (service) => {
      try {
        await service.initialize();
        logger.info(`Initialized MCP service: ${service.name} (${service.id})`);
      } catch (error) {
        logger.error(`Failed to initialize MCP service ${service.name} (${service.id}): ${error}`);
        // We'll keep the service registered but mark initialization as failed
      }
    });

    await Promise.all(initPromises);
    this.initialized = true;
    logger.info('MCP Registry initialization complete');
  }

  /**
   * Shutdown all registered services
   */
  public async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info(`Shutting down MCP Registry with ${this.services.size} services`);
    
    // Shutdown all services in parallel
    const shutdownPromises = Array.from(this.services.values()).map(async (service) => {
      try {
        await service.shutdown();
        logger.info(`Shut down MCP service: ${service.name} (${service.id})`);
      } catch (error) {
        logger.error(`Failed to shutdown MCP service ${service.name} (${service.id}): ${error}`);
      }
    });

    await Promise.all(shutdownPromises);
    this.initialized = false;
    this.services.clear();
    this.pendingConfirmations.clear();
    logger.info('MCP Registry shutdown complete');
  }

  /**
   * Register a new MCP service
   * 
   * @param service The service to register
   * @throws Error if a service with the same ID is already registered
   */
  public registerService(service: MCPService): void {
    if (this.services.has(service.id)) {
      throw new Error(`MCP service with ID ${service.id} is already registered`);
    }

    this.services.set(service.id, service);
    logger.info(`Registered MCP service: ${service.name} (${service.id}), priority: ${service.priority}, system: ${service.isSystemService}`);
    
    // Initialize the service if the registry is already initialized
    if (this.initialized) {
      service.initialize().catch((error) => {
        logger.error(`Failed to initialize newly registered MCP service ${service.name} (${service.id}): ${error}`);
      });
    }
  }

  /**
   * Unregister an MCP service
   * 
   * @param serviceId The ID of the service to unregister
   * @throws Error if no service with the given ID is registered
   */
  public async unregisterService(serviceId: string): Promise<void> {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`No MCP service with ID ${serviceId} is registered`);
    }

    // Shutdown the service before unregistering
    if (this.initialized) {
      try {
        await service.shutdown();
      } catch (error) {
        logger.error(`Failed to shutdown MCP service ${service.name} (${serviceId}) during unregistration: ${error}`);
      }
    }

    this.services.delete(serviceId);
    logger.info(`Unregistered MCP service: ${service.name} (${serviceId})`);
  }

  /**
   * Get all registered services
   */
  public getServices(): MCPService[] {
    return Array.from(this.services.values())
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get a service by its ID
   * 
   * @param serviceId The ID of the service to get
   * @returns The service with the given ID, or undefined if no such service is registered
   */
  public getService(serviceId: string): MCPService | undefined {
    return this.services.get(serviceId);
  }

  /**
   * Process a request by routing it to the appropriate service
   * 
   * @param context The request context
   * @returns The response from the selected service
   */
  public async processRequest(context: MCPRequestContext): Promise<MCPResponse> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if this is a confirmation response for a pending confirmation
    const confirmationResult = await this.checkConfirmation(context);
    if (confirmationResult) {
      return confirmationResult;
    }

    logger.info(`Processing request: ${context.requestId}, input: "${context.input.substring(0, 50)}${context.input.length > 50 ? '...' : ''}"`);

    // Find the service that can best handle this request
    const serviceScores: { service: MCPService, score: number }[] = [];
    
    // Collect scores from all services in parallel
    const scoringPromises = Array.from(this.services.values()).map(async (service) => {
      try {
        const score = await service.canHandle(context);
        if (score > 0) {
          serviceScores.push({ service, score });
        }
      } catch (error) {
        logger.error(`Error when checking if service ${service.name} can handle request: ${error}`);
      }
    });

    await Promise.all(scoringPromises);

    // Sort services by their scores (descending)
    serviceScores.sort((a, b) => b.score - a.score);

    // If no service can handle this request, return a default response
    if (serviceScores.length === 0) {
      logger.warn(`No MCP service can handle request: ${context.requestId}`);
      return {
        type: 'error',
        content: '没有服务能够处理您的请求。请尝试不同的命令或询问。',
        success: false
      };
    }

    // Use the service with the highest score
    const selectedService = serviceScores[0].service;
    logger.info(`Selected service for request ${context.requestId}: ${selectedService.name} (${selectedService.id}) with score ${serviceScores[0].score}`);

    try {
      // Process the request with the selected service
      const response = await selectedService.process(context);
      
      // 处理AI路由决策 - 如果是路由决策类型，并且指示应该重新路由
      if (response.type === 'routing_decision' && response.shouldRoute === true && response.metadata?.targetServiceId) {
        const targetServiceId = response.metadata.targetServiceId;
        const targetService = this.services.get(targetServiceId);
        
        if (targetService) {
          // 记录路由重定向
          logger.info(`AI路由决策: 从 ${selectedService.id} 重定向到 ${targetServiceId}, 置信度: ${response.metadata.confidence}, 原因: ${response.content}`);
          
          // 更新上下文，添加路由信息
          context.additionalContext = {
            ...context.additionalContext,
            routingDecision: {
              originalServiceId: selectedService.id,
              targetServiceId: targetServiceId,
              category: response.metadata.intentCategory,
              confidence: response.metadata.confidence,
              explanation: response.content
            }
          };
          
          // 使用目标服务重新处理请求
          const targetResponse = await targetService.process(context);
          
          // 添加路由信息到最终响应
          if (targetResponse.metadata) {
            targetResponse.metadata.routedBy = selectedService.id;
            targetResponse.metadata.originalCategory = response.metadata.intentCategory;
          } else {
            targetResponse.metadata = {
              routedBy: selectedService.id,
              originalCategory: response.metadata.intentCategory
            };
          }
          
          return targetResponse;
        } else {
          logger.warn(`AI路由决策指定的目标服务 ${targetServiceId} 不存在，使用原服务响应`);
        }
      }
      
      // If the service response requires confirmation, store the context for later
      if (response.requireConfirmation && response.isAwaitingConfirmation) {
        const confirmationKey = `${context.sessionId}_${Date.now()}`;
        this.pendingConfirmations.set(confirmationKey, { service: selectedService, context });
        logger.info(`Request ${context.requestId} requires confirmation, stored with key ${confirmationKey}`);
      }
      
      return response;
    } catch (error) {
      logger.error(`Error processing request ${context.requestId} with service ${selectedService.name}: ${error}`);
      return {
        type: 'error',
        content: `处理请求时出错: ${(error as Error).message}`,
        success: false
      };
    }
  }

  /**
   * Check if the input is a confirmation response for a pending confirmation
   * 
   * @param context The request context
   * @returns The processed confirmation response, or null if not a confirmation
   */
  private async checkConfirmation(context: MCPRequestContext): Promise<MCPResponse | null> {
    const input = context.input.trim().toLowerCase();
    
    // If there are no pending confirmations for this session, not a confirmation response
    if (this.pendingConfirmations.size === 0) {
      return null;
    }
    
    // Find pending confirmations for this session
    const pendingKeys = Array.from(this.pendingConfirmations.keys())
      .filter(key => key.startsWith(context.sessionId));
    
    if (pendingKeys.length === 0) {
      return null;
    }
    
    // Get the most recent pending confirmation
    const latestKey = pendingKeys.sort().pop();
    if (!latestKey) {
      return null;
    }
    
    const pendingItem = this.pendingConfirmations.get(latestKey);
    if (!pendingItem) {
      return null;
    }
    
    // Check if the input is a yes/no response
    const isConfirmed = this.isConfirmationResponse(input);
    if (isConfirmed === null) {
      // Not a confirmation response
      return null;
    }
    
    // Process the confirmation with the original service
    const { service, context: originalContext } = pendingItem;
    
    try {
      logger.info(`Processing confirmation response for request ${originalContext.requestId}, confirmed: ${isConfirmed}`);
      const response = await service.handleConfirmation(originalContext, isConfirmed);
      
      // Remove the pending confirmation
      this.pendingConfirmations.delete(latestKey);
      
      return response;
    } catch (error) {
      logger.error(`Error processing confirmation response with service ${service.name}: ${error}`);
      
      // Remove the pending confirmation
      this.pendingConfirmations.delete(latestKey);
      
      return {
        type: 'error',
        content: `处理确认响应时出错: ${(error as Error).message}`,
        success: false
      };
    }
  }

  /**
   * Determine if the input is a confirmation response (yes/no)
   * 
   * @param input The user input
   * @returns true if confirmed (yes), false if denied (no), null if not a confirmation response
   */
  private isConfirmationResponse(input: string): boolean | null {
    // Direct yes/no responses
    if (['y', 'yes', '是', '确认', '同意'].includes(input)) {
      return true;
    }
    
    if (['n', 'no', '否', '不', '取消', '拒绝'].includes(input)) {
      return false;
    }
    
    // Check for confirmation patterns like "(y/n) y"
    const confirmPattern = /\(y\/n\)\s*([yn]|yes|no)/i;
    const match = input.match(confirmPattern);
    if (match && match[1]) {
      const response = match[1].toLowerCase();
      return response === 'y' || response === 'yes';
    }
    
    // Check if input starts with y/n (quick response)
    if (input.startsWith('y') || input.startsWith('是') || input.startsWith('确认')) {
      return true;
    }
    
    if (input.startsWith('n') || input.startsWith('不') || input.startsWith('否')) {
      return false;
    }
    
    // Not a confirmation response
    return null;
  }
} 