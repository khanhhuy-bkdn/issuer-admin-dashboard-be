import { Request, Response, NextFunction } from 'express';
import redisClient from '../database/redis';
import blockchainService from '../services/blockchainService';
import issuerService from '../services/issuerService';
import { IssuerStatus } from '../types/issuer';
import logger from '../utils/logger';
import config from '../config';

interface HealthStatus {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    redis: ServiceHealth;
    blockchain: ServiceHealth;
    api: ServiceHealth;
  };
  metrics?: {
    totalIssuers: number;
    pendingIssuers: number;
    approvedIssuers: number;
    rejectedIssuers: number;
    lastProcessedBlock?: number;
    currentBlock?: number;
  };
}

interface ServiceHealth {
  status: 'healthy' | 'unhealthy';
  responseTime?: number;
  error?: string;
  details?: any;
}

export class HealthController {
  // GET /healthz - Basic health check
  async healthCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Check Redis health
      const redisHealth = await this.checkRedisHealth();
      
      // Check Blockchain health
      const blockchainHealth = await this.checkBlockchainHealth();
      
      // Determine overall status
      const overallStatus = this.determineOverallStatus([redisHealth, blockchainHealth]);
      
      const healthStatus: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          redis: redisHealth,
          blockchain: blockchainHealth,
          api: {
            status: 'healthy',
            responseTime: Date.now() - startTime
          }
        }
      };

      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json({
        success: overallStatus !== 'unhealthy',
        data: healthStatus
      });
    } catch (error) {
      logger.error('Health check failed:', error);
      next(error);
    }
  }

  // GET /healthz/detailed - Detailed health check with metrics
  async detailedHealthCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const startTime = Date.now();
      
      // Check all services
      const [redisHealth, blockchainHealth, metrics] = await Promise.all([
        this.checkRedisHealth(),
        this.checkBlockchainHealth(),
        this.getMetrics()
      ]);
      
      const overallStatus = this.determineOverallStatus([redisHealth, blockchainHealth]);
      
      const healthStatus: HealthStatus = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          redis: redisHealth,
          blockchain: blockchainHealth,
          api: {
            status: 'healthy',
            responseTime: Date.now() - startTime
          }
        },
        metrics
      };

      const statusCode = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;
      
      res.status(statusCode).json({
        success: overallStatus !== 'unhealthy',
        data: healthStatus
      });
    } catch (error) {
      logger.error('Detailed health check failed:', error);
      next(error);
    }
  }

  // GET /healthz/ready - Readiness probe
  async readinessCheck(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Check if all critical services are ready
      const redisReady = redisClient.isHealthy();
      const blockchainReady = blockchainService.isHealthy();
      
      const isReady = redisReady && blockchainReady;
      
      res.status(isReady ? 200 : 503).json({
        success: isReady,
        ready: isReady,
        services: {
          redis: redisReady,
          blockchain: blockchainReady
        }
      });
    } catch (error) {
      logger.error('Readiness check failed:', error);
      res.status(503).json({
        success: false,
        ready: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // GET /healthz/live - Liveness probe
  async livenessCheck(req: Request, res: Response): Promise<void> {
    // Simple liveness check - if the process is running, it's alive
    res.status(200).json({
      success: true,
      alive: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  }

  private async checkRedisHealth(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      if (!redisClient.isHealthy()) {
        return {
          status: 'unhealthy',
          error: 'Redis client not connected'
        };
      }
      
      await redisClient.ping();
      
      return {
        status: 'healthy',
        responseTime: Date.now() - startTime
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async checkBlockchainHealth(): Promise<ServiceHealth> {
    const startTime = Date.now();
    
    try {
      if (!blockchainService.isHealthy()) {
        return {
          status: 'unhealthy',
          error: 'Blockchain service not initialized'
        };
      }
      
      const blockNumber = await blockchainService.getCurrentBlockNumber();
      
      return {
        status: 'healthy',
        responseTime: Date.now() - startTime,
        details: {
          currentBlock: blockNumber
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getMetrics(): Promise<HealthStatus['metrics']> {
    try {
      const [pendingResult, approvedResult, rejectedResult] = await Promise.all([
        issuerService.getIssuersByStatus({ status: IssuerStatus.PENDING, limit: 1 }),
        issuerService.getIssuersByStatus({ status: IssuerStatus.APPROVED, limit: 1 }),
        issuerService.getIssuersByStatus({ status: IssuerStatus.REJECTED, limit: 1 })
      ]);

      const totalIssuers = pendingResult.total + approvedResult.total + rejectedResult.total;
      
      // Get last processed block from Redis
      let lastProcessedBlock: number | undefined;
      let currentBlock: number | undefined;
      
      try {
        const lastBlock = await redisClient.getClient().get('backfill:last_processed_block');
        lastProcessedBlock = lastBlock ? parseInt(lastBlock, 10) : undefined;
        currentBlock = await blockchainService.getCurrentBlockNumber();
      } catch (error) {
        logger.warn('Failed to get block metrics:', error);
      }

      return {
        totalIssuers,
        pendingIssuers: pendingResult.total,
        approvedIssuers: approvedResult.total,
        rejectedIssuers: rejectedResult.total,
        lastProcessedBlock,
        currentBlock
      };
    } catch (error) {
      logger.error('Failed to get metrics:', error);
      return {
        totalIssuers: 0,
        pendingIssuers: 0,
        approvedIssuers: 0,
        rejectedIssuers: 0
      };
    }
  }

  private determineOverallStatus(serviceHealths: ServiceHealth[]): 'healthy' | 'unhealthy' | 'degraded' {
    const unhealthyServices = serviceHealths.filter(service => service.status === 'unhealthy');
    
    if (unhealthyServices.length === 0) {
      return 'healthy';
    } else if (unhealthyServices.length === serviceHealths.length) {
      return 'unhealthy';
    } else {
      return 'degraded';
    }
  }
}

export default new HealthController();