import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import config from './config';
import logger from './utils/logger';
import redisClient from './database/redis';
import blockchainService from './services/blockchainService';

// Routes
import issuerRoutes from './routes/issuerRoutes';
import healthRoutes from './routes/healthRoutes';

// Middleware
import {
  errorHandler,
  notFoundHandler,
  requestLogger
} from './middleware/validation';

export class App {
  public app: Application;
  private isShuttingDown: boolean = false;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupGracefulShutdown();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
    }));

    // CORS configuration
    this.app.use(cors({
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true
    }));

    // Body parsing middleware
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use(requestLogger);

    // Trust proxy (for proper IP detection behind load balancers)
    this.app.set('trust proxy', 1);
  }

  private setupRoutes(): void {
    // Health check routes (no prefix)
    this.app.use('/healthz', healthRoutes);

    // API routes with prefix
    this.app.use(`${config.api.prefix}/issuers`, issuerRoutes);
    this.app.use(`${config.api.prefix}/issuer`, issuerRoutes);

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'Issuer Admin Backend API',
        version: process.env.npm_package_version || '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/healthz',
          api: config.api.prefix
        }
      });
    });
  }

  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Global error handler
    this.app.use(errorHandler);
  }

  private setupGracefulShutdown(): void {
    // Handle graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.warn('Shutdown already in progress...');
        return;
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        if (this.server) {
          this.server.close(() => {
            logger.info('HTTP server closed');
          });
        }

        // Stop blockchain event listeners
        await blockchainService.stopListening();
        logger.info('Blockchain event listeners stopped');

        // Disconnect from blockchain
        await blockchainService.disconnect();
        logger.info('Blockchain service disconnected');

        // Disconnect from Redis
        await redisClient.disconnect();
        logger.info('Redis connection closed');

        logger.info('Graceful shutdown completed');
        process.exit(0);
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    // Listen for termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      gracefulShutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      gracefulShutdown('unhandledRejection');
    });
  }

  private server: any;

  public async start(): Promise<void> {
    try {
      // Initialize services
      await this.initializeServices();

      // Start HTTP server
      this.server = this.app.listen(config.api.port, () => {
        logger.info(`Server started on port ${config.api.port}`);
        logger.info(`API available at http://localhost:${config.api.port}${config.api.prefix}`);
        logger.info(`Health check available at http://localhost:${config.api.port}/healthz`);
      });

      // Handle server errors
      this.server.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
          logger.error(`Port ${config.api.port} is already in use`);
        } else {
          logger.error('Server error:', error);
        }
        process.exit(1);
      });

    } catch (error) {
      logger.error('Failed to start application:', error);
      process.exit(1);
    }
  }

  private async initializeServices(): Promise<void> {
    try {
      // Connect to Redis
      logger.info('Connecting to Redis...');
      await redisClient.connect();
      logger.info('Redis connected successfully');

      // Initialize blockchain service
      logger.info('Initializing blockchain service...');
      await blockchainService.initialize();
      logger.info('Blockchain service initialized successfully');

      // Start event monitoring with fallback strategy
      await this.startEventMonitoring();

    } catch (error) {
      logger.error('Failed to initialize services:', error);
      throw error;
    }
  }

  private async startEventMonitoring(): Promise<void> {
    try {
      // Check if WebSocket is available
      const hasWebSocket = config.blockchain.wssUrl && config.blockchain.wssUrl.trim() !== '';
      
      if (hasWebSocket) {
        logger.info('WebSocket URL configured, attempting real-time event listening...');
        try {
          // Try WebSocket subscription with retry mechanism first
          await blockchainService.subscribeWithRetry();
          logger.info('Real-time event subscription started successfully');
        } catch (error) {
          logger.warn('WebSocket subscription failed, falling back to polling:', error);
          await this.startPollingFallback();
        }
      } else {
        logger.info('WebSocket URL not configured, using polling service...');
        await this.startPollingFallback();
      }
    } catch (error) {
      logger.error('Failed to start event monitoring:', error);
      throw error;
    }
  }

  private async startPollingFallback(): Promise<void> {
    try {
      await blockchainService.startPolling();
      logger.info('Event polling service started successfully');
    } catch (error) {
      logger.error('Failed to start polling service:', error);
      throw error;
    }
  }

  public getApp(): Application {
    return this.app;
  }
}

export default App;