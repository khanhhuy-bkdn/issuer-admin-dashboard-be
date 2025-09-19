import { Log } from 'ethers';
import config from '../config';
import logger from '../utils/logger';
import redisClient from '../database/redis';
import blockchainService from '../services/blockchainService';
import issuerService from '../services/issuerService';
import {
  IssuerApplicationSubmittedEvent,
  IssuerApprovedEvent,
  IssuerRejectedEvent,
  EventMetadata
} from '../types/issuer';

interface BackfillOptions {
  startBlock?: number;
  endBlock?: number | 'latest';
  batchSize?: number;
  delayBetweenBatches?: number;
}

class BackfillService {
  private readonly BATCH_SIZE = 999;
  private readonly DELAY_BETWEEN_BATCHES = 1000; // 1 second
  private readonly REDIS_BACKFILL_KEY = 'backfill:last_processed_block';

  async run(options: BackfillOptions = {}): Promise<void> {
    try {
      logger.info('Starting backfill process...');

      // Connect to Redis and Blockchain
      await redisClient.connect();
      await blockchainService.initialize();

      const {
        startBlock = config.blockchain.startBlock,
        endBlock = 'latest',
        batchSize = this.BATCH_SIZE,
        delayBetweenBatches = this.DELAY_BETWEEN_BATCHES
      } = options;

      // Get the last processed block from Redis
      const lastProcessedBlock = await this.getLastProcessedBlock();
      const fromBlock = Math.max(startBlock, lastProcessedBlock + 1);

      // Get current block number if endBlock is 'latest'
      const toBlock = endBlock === 'latest' 
        ? await blockchainService.getCurrentBlockNumber()
        : endBlock;

      logger.info(`Backfilling events from block ${fromBlock} to ${toBlock}`);

      if (fromBlock > toBlock) {
        logger.info('No new blocks to process');
        return;
      }

      // Process events in batches
      let currentBlock = fromBlock;
      let totalEventsProcessed = 0;

      while (currentBlock <= toBlock) {
        const batchEndBlock = Math.min(currentBlock + batchSize - 1, toBlock);
        
        logger.info(`Processing batch: blocks ${currentBlock} to ${batchEndBlock}`);

        try {
          const logs = await blockchainService.getHistoricalEvents(currentBlock, batchEndBlock);
          const eventsProcessed = await this.processLogs(logs);
          
          totalEventsProcessed += eventsProcessed;
          
          // Update last processed block
          await this.setLastProcessedBlock(batchEndBlock);
          
          logger.info(`Batch completed: ${eventsProcessed} events processed`);
          
          // Delay between batches to avoid rate limiting
          if (currentBlock < toBlock && delayBetweenBatches > 0) {
            await this.delay(delayBetweenBatches);
          }
          
        } catch (error) {
          logger.error(`Error processing batch ${currentBlock}-${batchEndBlock}:`, error);
          // Continue with next batch instead of failing completely
        }

        currentBlock = batchEndBlock + 1;
      }

      logger.info(`Backfill completed. Total events processed: ${totalEventsProcessed}`);
      
    } catch (error) {
      logger.error('Backfill process failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  private async processLogs(logs: Log[]): Promise<number> {
    let eventsProcessed = 0;

    for (const log of logs) {
      try {
        const parsedEvent = blockchainService.parseLog(log);
        
        if (!parsedEvent) {
          logger.warn('Failed to parse log:', { txHash: log.transactionHash, blockNumber: log.blockNumber });
          continue;
        }

        const metadata: EventMetadata = {
          txHash: log.transactionHash,
          blockNumber: log.blockNumber,
          timestamp: await blockchainService.getBlockTimestamp(log.blockNumber)
        };

        await this.processEvent(parsedEvent.eventName, parsedEvent.args, metadata);
        eventsProcessed++;
        
      } catch (error) {
        logger.error('Error processing individual log:', error, {
          txHash: log.transactionHash,
          blockNumber: log.blockNumber
        });
        // Continue processing other logs
      }
    }

    return eventsProcessed;
  }

  private async processEvent(eventName: string, args: any, metadata: EventMetadata): Promise<void> {
    switch (eventName) {
      case 'IssuerApplicationSubmitted':
        const applicationEvent: IssuerApplicationSubmittedEvent = {
          issuer: args.issuer,
          name: args.name,
          requestedCategories: args.requestedCategories,
          proposedFixedFee: args.proposedFixedFee.toString(),
          publicKey: args.publicKey,
          stakeAmount: args.stakeAmount.toString()
        };
        await issuerService.handleApplicationSubmitted(applicationEvent, metadata);
        break;

      case 'IssuerApproved':
        const approvedEvent: IssuerApprovedEvent = {
          caller: args.caller,
          issuer: args.issuer,
          attestationUID: args.attestationUID,
          approveFixedFee: args.approveFixedFee
        };
        await issuerService.handleIssuerApproved(approvedEvent, metadata);
        break;

      case 'IssuerRejected':
        const rejectedEvent: IssuerRejectedEvent = {
          caller: args.caller,
          issuer: args.issuer
        };
        await issuerService.handleIssuerRejected(rejectedEvent, metadata);
        break;

      default:
        logger.warn(`Unknown event type: ${eventName}`);
    }
  }

  private async getLastProcessedBlock(): Promise<number> {
    try {
      const lastBlock = await redisClient.getClient().get(this.REDIS_BACKFILL_KEY);
      return lastBlock ? parseInt(lastBlock, 10) : config.blockchain.startBlock - 1;
    } catch (error) {
      logger.error('Error getting last processed block:', error);
      return config.blockchain.startBlock - 1;
    }
  }

  private async setLastProcessedBlock(blockNumber: number): Promise<void> {
    try {
      await redisClient.getClient().set(this.REDIS_BACKFILL_KEY, blockNumber.toString());
    } catch (error) {
      logger.error('Error setting last processed block:', error);
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async cleanup(): Promise<void> {
    try {
      await blockchainService.disconnect();
      await redisClient.disconnect();
      logger.info('Cleanup completed');
    } catch (error) {
      logger.error('Error during cleanup:', error);
    }
  }

  // Method to reset backfill progress (useful for testing or re-syncing)
  async resetProgress(): Promise<void> {
    try {
      await redisClient.connect();
      await redisClient.getClient().del(this.REDIS_BACKFILL_KEY);
      logger.info('Backfill progress reset');
    } catch (error) {
      logger.error('Error resetting backfill progress:', error);
      throw error;
    } finally {
      await redisClient.disconnect();
    }
  }

  // Method to get current backfill status
  async getStatus(): Promise<{ lastProcessedBlock: number; currentBlock: number }> {
    try {
      await redisClient.connect();
      await blockchainService.initialize();
      
      const lastProcessedBlock = await this.getLastProcessedBlock();
      const currentBlock = await blockchainService.getCurrentBlockNumber();
      
      return { lastProcessedBlock, currentBlock };
    } catch (error) {
      logger.error('Error getting backfill status:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }
}

// CLI interface
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const backfillService = new BackfillService();

  try {
    if (args.includes('--reset')) {
      logger.info('Resetting backfill progress...');
      await backfillService.resetProgress();
      return;
    }

    if (args.includes('--status')) {
      logger.info('Getting backfill status...');
      const status = await backfillService.getStatus();
      logger.info('Backfill Status:', status);
      return;
    }

    // Parse command line arguments
    const options: BackfillOptions = {};
    
    const startBlockIndex = args.indexOf('--start-block');
    if (startBlockIndex !== -1 && args[startBlockIndex + 1]) {
      options.startBlock = parseInt(args[startBlockIndex + 1], 10);
    }

    const endBlockIndex = args.indexOf('--end-block');
    if (endBlockIndex !== -1 && args[endBlockIndex + 1]) {
      const endBlockArg = args[endBlockIndex + 1];
      options.endBlock = endBlockArg === 'latest' ? 'latest' : parseInt(endBlockArg, 10);
    }

    const batchSizeIndex = args.indexOf('--batch-size');
    if (batchSizeIndex !== -1 && args[batchSizeIndex + 1]) {
      options.batchSize = parseInt(args[batchSizeIndex + 1], 10);
    }

    await backfillService.run(options);
    
  } catch (error) {
    logger.error('Backfill script failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

export { BackfillService };
export default new BackfillService();