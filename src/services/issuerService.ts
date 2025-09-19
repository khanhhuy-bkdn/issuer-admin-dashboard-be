import Redis from 'ioredis';
import redisClient from '../database/redis';
import logger from '../utils/logger';
import {
  IssuerData,
  IssuerStatus,
  IssuerApplicationSubmittedEvent,
  IssuerApprovedEvent,
  IssuerRejectedEvent,
  EventMetadata,
  IssuerQueryParams,
  IssuerListResponse
} from '../types/issuer';

export class IssuerService {
  private redis: Redis;

  constructor() {
    this.redis = redisClient.getClient();
  }

  // Redis key generators
  private getIssuerKey(address: string): string {
    return `issuer:${address.toLowerCase()}`;
  }

  private getStatusListKey(status: IssuerStatus): string {
    return `issuers:${status}`;
  }

  // Handle IssuerApplicationSubmitted event
  async handleApplicationSubmitted(
    event: IssuerApplicationSubmittedEvent,
    metadata: EventMetadata
  ): Promise<void> {
    try {
      const issuerKey = this.getIssuerKey(event.issuer);
      const pendingListKey = this.getStatusListKey(IssuerStatus.PENDING);

      const issuerData: IssuerData = {
        address: event.issuer.toLowerCase(),
        name: event.name,
        requestedCategories: event.requestedCategories,
        proposedFixedFee: event.proposedFixedFee,
        publicKey: event.publicKey,
        stakeAmount: event.stakeAmount,
        status: IssuerStatus.PENDING,
        submittedAt: metadata.timestamp,
        updatedAt: metadata.timestamp,
        txHash: metadata.txHash,
        blockNumber: metadata.blockNumber
      };

      // Use pipeline for atomic operations
      const pipeline = this.redis.pipeline();
      
      // Store issuer data as hash
      pipeline.hset(issuerKey, {
        address: issuerData.address,
        name: issuerData.name,
        requestedCategories: JSON.stringify(issuerData.requestedCategories),
        proposedFixedFee: issuerData.proposedFixedFee,
        publicKey: issuerData.publicKey,
        stakeAmount: issuerData.stakeAmount,
        status: issuerData.status,
        submittedAt: issuerData.submittedAt.toString(),
        updatedAt: issuerData.updatedAt.toString(),
        txHash: issuerData.txHash,
        blockNumber: issuerData.blockNumber.toString()
      });

      // Add to pending list
      pipeline.lpush(pendingListKey, event.issuer.toLowerCase());

      await pipeline.exec();

      logger.info('Issuer application submitted processed', {
        issuer: event.issuer,
        name: event.name,
        txHash: metadata.txHash,
        blockNumber: metadata.blockNumber
      });
    } catch (error) {
      logger.error('Error handling application submitted event:', error);
      throw error;
    }
  }

  // Handle IssuerApproved event
  async handleIssuerApproved(
    event: IssuerApprovedEvent,
    metadata: EventMetadata
  ): Promise<void> {
    try {
      const issuerKey = this.getIssuerKey(event.issuer);
      const pendingListKey = this.getStatusListKey(IssuerStatus.PENDING);
      const approvedListKey = this.getStatusListKey(IssuerStatus.APPROVED);

      const pipeline = this.redis.pipeline();

      // Update issuer status and add approval data
      pipeline.hset(issuerKey, {
        status: IssuerStatus.APPROVED,
        attestationUID: event.attestationUID,
        approveFixedFee: event.approveFixedFee.toString(),
        updatedAt: metadata.timestamp.toString()
      });

      // Move from pending to approved list
      pipeline.lrem(pendingListKey, 0, event.issuer.toLowerCase());
      pipeline.lpush(approvedListKey, event.issuer.toLowerCase());

      await pipeline.exec();

      logger.info('Issuer approved processed', {
        issuer: event.issuer,
        caller: event.caller,
        attestationUID: event.attestationUID,
        txHash: metadata.txHash,
        blockNumber: metadata.blockNumber
      });
    } catch (error) {
      logger.error('Error handling issuer approved event:', error);
      throw error;
    }
  }

  // Handle IssuerRejected event
  async handleIssuerRejected(
    event: IssuerRejectedEvent,
    metadata: EventMetadata
  ): Promise<void> {
    try {
      const issuerKey = this.getIssuerKey(event.issuer);
      const pendingListKey = this.getStatusListKey(IssuerStatus.PENDING);
      const rejectedListKey = this.getStatusListKey(IssuerStatus.REJECTED);

      const pipeline = this.redis.pipeline();

      // Update issuer status
      pipeline.hset(issuerKey, {
        status: IssuerStatus.REJECTED,
        updatedAt: metadata.timestamp.toString()
      });

      // Move from pending to rejected list
      pipeline.lrem(pendingListKey, 0, event.issuer.toLowerCase());
      pipeline.lpush(rejectedListKey, event.issuer.toLowerCase());

      await pipeline.exec();

      logger.info('Issuer rejected processed', {
        issuer: event.issuer,
        caller: event.caller,
        txHash: metadata.txHash,
        blockNumber: metadata.blockNumber
      });
    } catch (error) {
      logger.error('Error handling issuer rejected event:', error);
      throw error;
    }
  }

  // Get issuer by address
  async getIssuer(address: string): Promise<IssuerData | null> {
    try {
      const issuerKey = this.getIssuerKey(address);
      const data = await this.redis.hgetall(issuerKey);

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      return {
        address: data.address,
        name: data.name,
        requestedCategories: JSON.parse(data.requestedCategories || '[]'),
        proposedFixedFee: data.proposedFixedFee,
        publicKey: data.publicKey,
        stakeAmount: data.stakeAmount,
        status: data.status as IssuerStatus,
        attestationUID: data.attestationUID,
        approveFixedFee: data.approveFixedFee ? data.approveFixedFee === 'true' : undefined,
        submittedAt: parseInt(data.submittedAt),
        updatedAt: parseInt(data.updatedAt),
        txHash: data.txHash,
        blockNumber: parseInt(data.blockNumber)
      };
    } catch (error) {
      logger.error('Error getting issuer:', error);
      throw error;
    }
  }

  // Get issuers by status with pagination
  async getIssuersByStatus(params: IssuerQueryParams): Promise<IssuerListResponse> {
    try {
      const { status, limit = 50, offset = 0 } = params;
      
      if (!status) {
        throw new Error('Status is required');
      }

      const listKey = this.getStatusListKey(status);
      const total = await this.redis.llen(listKey);
      const issuerAddresses = await this.redis.lrange(listKey, offset, offset + limit - 1);

      const issuers: IssuerData[] = [];
      
      for (const address of issuerAddresses) {
        const issuer = await this.getIssuer(address);
        if (issuer) {
          issuers.push(issuer);
        }
      }

      return {
        issuers,
        total,
        limit,
        offset
      };
    } catch (error) {
      logger.error('Error getting issuers by status:', error);
      throw error;
    }
  }

  // Get all issuers with pagination
  async getAllIssuers(limit: number = 50, offset: number = 0): Promise<IssuerListResponse> {
    try {
      const statuses = [IssuerStatus.PENDING, IssuerStatus.APPROVED, IssuerStatus.REJECTED];
      const allIssuers: IssuerData[] = [];
      let totalCount = 0;

      for (const status of statuses) {
        const result = await this.getIssuersByStatus({ status, limit: 1000 }); // Get all for each status
        allIssuers.push(...result.issuers);
        totalCount += result.total;
      }

      // Sort by updatedAt descending
      allIssuers.sort((a, b) => b.updatedAt - a.updatedAt);

      // Apply pagination
      const paginatedIssuers = allIssuers.slice(offset, offset + limit);

      return {
        issuers: paginatedIssuers,
        total: totalCount,
        limit,
        offset
      };
    } catch (error) {
      logger.error('Error getting all issuers:', error);
      throw error;
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return false;
    }
  }
}

export default new IssuerService();