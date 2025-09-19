import Redis from 'ioredis';
import config from '../config';
import logger from '../utils/logger';

class RedisClient {
  private client: Redis;
  private isConnected: boolean = false;

  constructor() {
    const redisConfig: any = {
      host: config.redis.host,
      port: config.redis.port,
      db: config.redis.db,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnFailover: 100,
      enableOfflineQueue: true,
      autoResubscribe: false,
      autoResendUnfulfilledCommands: false,
    };

    // Only add password if it's provided and not empty
    if (config.redis.password && config.redis.password.trim() !== '') {
      redisConfig.password = config.redis.password;
    }

    this.client = new Redis(redisConfig);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', (error) => {
      const errorDetails: any = {
        message: error.message,
        stack: error.stack
      };
      
      // Add additional properties if they exist
      if ('code' in error) errorDetails.code = (error as any).code;
      if ('errno' in error) errorDetails.errno = (error as any).errno;
      if ('syscall' in error) errorDetails.syscall = (error as any).syscall;
      if ('address' in error) errorDetails.address = (error as any).address;
      if ('port' in error) errorDetails.port = (error as any).port;
      
      logger.error('Redis client error:', errorDetails);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });

    this.client.on('end', () => {
      logger.warn('Redis client connection ended');
      this.isConnected = false;
    });

    // Handle lazyConnect errors
    this.client.on('lazyConnect', () => {
      logger.info('Redis lazy connect triggered');
    });
  }

  async connect(): Promise<void> {
    try {
      if (this.isConnected) {
        logger.info('Redis already connected');
        return;
      }

      logger.info('Attempting to connect to Redis...');
      await this.client.connect();
      logger.info('Redis connection established');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.client.status === 'ready' || this.client.status === 'connecting') {
        await this.client.quit();
        logger.info('Redis connection closed');
      } else {
        this.client.disconnect();
        logger.info('Redis connection forcefully closed');
      }
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
      // Don't throw error during shutdown
      this.client.disconnect();
    }
  }

  getClient(): Redis {
    return this.client;
  }

  isHealthy(): boolean {
    return this.isConnected && this.client.status === 'ready';
  }

  async ping(): Promise<string> {
    return await this.client.ping();
  }
}

// Singleton instance
const redisClient = new RedisClient();

export default redisClient;
export { RedisClient };