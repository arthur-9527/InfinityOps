import { createModuleLogger } from '../utils/logger';
import { getRedisService } from '../services/redisService';

const logger = createModuleLogger('test-redis');

async function testRedisService() {
  logger.info('Starting Redis service test...');
  
  try {
    // Get Redis service
    const redis = getRedisService();
    
    // Connect to Redis
    await redis.connect();
    logger.info('Connected to Redis server');
    
    // Test string operations
    logger.info('Testing string operations...');
    await redis.set('test:key', 'Hello Redis!');
    const value = await redis.get('test:key');
    logger.info(`Retrieved value: ${value}`);
    
    // Test with expiration
    logger.info('Testing expiration...');
    await redis.setEx('test:expiring', 5, 'This will expire in 5 seconds');
    logger.info(`Exists before expiry: ${await redis.exists('test:expiring')}`);
    
    // Test hash operations
    logger.info('Testing hash operations...');
    await redis.hSet('test:hash', 'field1', 'value1');
    await redis.hSet('test:hash', 'field2', 'value2');
    const field1Value = await redis.hGet('test:hash', 'field1');
    logger.info(`Hash field1 value: ${field1Value}`);
    
    const allFields = await redis.hGetAll('test:hash');
    logger.info('All hash fields:', allFields);
    
    // Test list operations
    logger.info('Testing list operations...');
    await redis.lPush('test:list', 'item1', 'item2', 'item3');
    const items = await redis.lRange('test:list', 0, -1);
    logger.info('List items:', items);
    
    // Wait for expiring key to expire
    logger.info('Waiting for key to expire...');
    await new Promise(resolve => setTimeout(resolve, 6000));
    logger.info(`Exists after expiry: ${await redis.exists('test:expiring')}`);
    
    // Clean up
    logger.info('Cleaning up test keys...');
    await redis.del('test:key');
    await redis.del('test:hash');
    await redis.del('test:list');
    
    // Disconnect
    await redis.disconnect();
    logger.info('Test completed successfully');
    
  } catch (error) {
    logger.error(`Test failed: ${(error as Error).message}`);
  }
}

// Run the test
testRedisService().catch(error => {
  logger.error(`Unhandled error: ${error.message}`);
  process.exit(1);
}); 