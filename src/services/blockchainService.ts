import { ethers, Contract, WebSocketProvider, JsonRpcProvider, Log } from 'ethers';
import config from '../config';
import logger from '../utils/logger';
import { ISSUER_CONTRACT_ABI } from '../contracts/abi';
import issuerService from './issuerService';
import redisClient from '../database/redis';
import {
  IssuerApplicationSubmittedEvent,
  IssuerApprovedEvent,
  IssuerRejectedEvent,
  EventMetadata
} from '../types/issuer';

export class BlockchainService {
  private wsProvider: WebSocketProvider | null = null;
  private rpcProvider: JsonRpcProvider;
  private contract: Contract | null = null;
  private isListening: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000;
  
  // Polling service properties
  private isPolling: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private pollingIntervalMs: number = 10000; // Poll every 10 seconds
  private retryDelayMs: number = 5000; // Retry after 5 seconds on error
  private lastBlockRedisKey: string = 'blockchain:lastBlock';

  constructor() {
    this.rpcProvider = new JsonRpcProvider(config.blockchain.rpcUrl);
    this.setupWebSocketProvider();
  }

  private setupWebSocketProvider(): void {
    if (!config.blockchain.wssUrl) {
      logger.info('WebSocket URL not configured, WebSocket provider will not be initialized');
      return;
    }

    try {
      this.wsProvider = new WebSocketProvider(config.blockchain.wssUrl);
      this.setupWebSocketEventHandlers();
    } catch (error) {
      logger.error('Failed to setup WebSocket provider:', error);
    }
  }

  private setupWebSocketEventHandlers(): void {
    if (!this.wsProvider) return;

    // WebSocket event handlers for Ethers v6
    // Note: Ethers v6 WebSocketProvider doesn't expose 'open', 'close', 'error' events directly
    // We'll handle connection status through other means
    
    // Listen for network events instead
    this.wsProvider.on('network', (newNetwork, oldNetwork) => {
      if (newNetwork) {
        logger.info('WebSocket network connected:', newNetwork.name);
        this.reconnectAttempts = 0;
      }
    });

    // Listen for debug events if available
    this.wsProvider.on('debug', (info) => {
      logger.debug('WebSocket debug:', info);
    });
  }

  private async handleWebSocketReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached. Switching to polling mode.');
      return;
    }

    this.reconnectAttempts++;
    logger.info(`Attempting to reconnect WebSocket (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(() => {
      this.setupWebSocketProvider();
      if (this.isListening) {
        this.startListening();
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  async initialize(): Promise<void> {
    try {
      // Test RPC connection
      const blockNumber = await this.rpcProvider.getBlockNumber();
      logger.info(`Connected to blockchain. Current block: ${blockNumber}`);

      // Initialize contract
      const provider = this.wsProvider || this.rpcProvider;
      this.contract = new Contract(
        config.blockchain.contractAddress,
        ISSUER_CONTRACT_ABI,
        provider
      );

      logger.info('Blockchain service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize blockchain service:', error);
      throw error;
    }
  }

  async startListening(): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized. Call initialize() first.');
    }

    if (this.isListening) {
      logger.warn('Already listening to events');
      return;
    }

    // if (!this.wsProvider) {
    //   logger.warn('WebSocket provider not available. Real-time event listening is disabled. Use getHistoricalEvents() for polling.');
    //   return;
    // }

    try {
      // Listen to IssuerApplicationSubmitted events
      this.contract.on('IssuerApplicationSubmitted', async (
        issuer: string,
        name: string,
        requestedCategories: string[],
        proposedFixedFee: bigint,
        publicKey: string,
        stakeAmount: bigint,
        event: any
      ) => {
        await this.handleIssuerApplicationSubmitted({
          issuer,
          name,
          requestedCategories,
          proposedFixedFee: proposedFixedFee.toString(),
          publicKey,
          stakeAmount: stakeAmount.toString()
        }, {
          txHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber,
          timestamp: Date.now()
        });
      });

      // Listen to IssuerApproved events
      this.contract.on('IssuerApproved', async (
        caller: string,
        issuer: string,
        attestationUID: string,
        approveFixedFee: boolean,
        event: any
      ) => {
        await this.handleIssuerApproved({
          caller,
          issuer,
          attestationUID,
          approveFixedFee
        }, {
          txHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber,
          timestamp: Date.now()
        });
      });

      // Listen to IssuerRejected events
      this.contract.on('IssuerRejected', async (
        caller: string,
        issuer: string,
        event: any
      ) => {
        await this.handleIssuerRejected({
          caller,
          issuer
        }, {
          txHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber,
          timestamp: Date.now()
        });
      });

      this.isListening = true;
      logger.info('Started listening to smart contract events');
    } catch (error) {
      logger.error('Failed to start listening to events:', error);
      throw error;
    }
  }

  async stopListening(): Promise<void> {
    if (!this.contract || !this.isListening) {
      return;
    }

    try {
      this.contract.removeAllListeners();
      this.isListening = false;
      logger.info('Stopped listening to smart contract events');
    } catch (error) {
      logger.error('Error stopping event listeners:', error);
      throw error;
    }
  }

  /**
   * Start polling for events with retry mechanism
   * This method handles filter expiration and automatically retries
   */
  async startPolling(): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized. Call initialize() first.');
    }

    if (this.isPolling) {
      logger.warn('Already polling for events');
      return;
    }

    this.isPolling = true;
    logger.info('Starting event polling service with retry mechanism');
    
    // Start the polling loop
    this.pollEvents();
  }

  /**
   * Stop the polling service
   */
  async stopPolling(): Promise<void> {
    if (!this.isPolling) {
      return;
    }

    this.isPolling = false;
    
    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval);
      this.pollingInterval = null;
    }

    logger.info('Stopped event polling service');
  }

  /**
   * Main polling loop with retry mechanism
   */
  private async pollEvents(): Promise<void> {
    if (!this.isPolling) {
      return;
    }

    try {
      // Get last processed block from Redis
      let lastBlock = await this.getLastProcessedBlock();
      
      // Get current block number
      const currentBlock = await this.getCurrentBlockNumber();
      
      if (currentBlock > lastBlock) {
        logger.info(`Polling events from block ${lastBlock + 1} to ${currentBlock}`);
        
        // Get logs for the range
        const logs = await this.rpcProvider.getLogs({
          address: config.blockchain.contractAddress,
          fromBlock: lastBlock + 1,
          toBlock: currentBlock,
        });

        // Process each log
        for (const log of logs) {
          await this.processEventLog(log);
        }

        // Update last processed block in Redis
        await this.updateLastProcessedBlock(currentBlock);
        
        if (logs.length > 0) {
          logger.info(`Processed ${logs.length} events from blocks ${lastBlock + 1} to ${currentBlock}`);
        }
      }

      // Schedule next poll
      this.pollingInterval = setTimeout(() => {
        this.pollEvents();
      }, this.pollingIntervalMs);
      
    } catch (error) {
      logger.error('Polling error:', error);
      
      // Retry after delay
      this.pollingInterval = setTimeout(() => {
        this.pollEvents();
      }, this.retryDelayMs);
    }
  }

  /**
   * Process a single event log
   */
  private async processEventLog(log: Log): Promise<void> {
    try {
      const parsed = this.parseLog(log);
      if (!parsed) {
        return;
      }

      const metadata: EventMetadata = {
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        timestamp: Date.now()
      };

      // Handle different event types
      switch (parsed.eventName) {
        case 'IssuerApplicationSubmitted':
          await this.handleIssuerApplicationSubmitted({
            issuer: parsed.args.issuer,
            name: parsed.args.name,
            requestedCategories: parsed.args.requestedCategories,
            proposedFixedFee: parsed.args.proposedFixedFee.toString(),
            publicKey: parsed.args.publicKey,
            stakeAmount: parsed.args.stakeAmount.toString()
          }, metadata);
          break;
          
        case 'IssuerApproved':
          await this.handleIssuerApproved({
            caller: parsed.args.caller,
            issuer: parsed.args.issuer,
            attestationUID: parsed.args.attestationUID,
            approveFixedFee: parsed.args.approveFixedFee
          }, metadata);
          break;
          
        case 'IssuerRejected':
          await this.handleIssuerRejected({
            caller: parsed.args.caller,
            issuer: parsed.args.issuer
          }, metadata);
          break;
          
        default:
          logger.debug(`Unknown event type: ${parsed.eventName}`);
      }
    } catch (error) {
      logger.error('Error processing event log:', error, { logData: log });
    }
  }

  /**
   * Get last processed block from Redis
   */
  private async getLastProcessedBlock(): Promise<number> {
    try {
      const redis = redisClient.getClient();
      const lastBlockStr = await redis.get(this.lastBlockRedisKey);
      
      if (lastBlockStr) {
        return parseInt(lastBlockStr, 10);
      }
      
      // If no last block in Redis, start from current block
      const currentBlock = await this.getCurrentBlockNumber();
      await this.updateLastProcessedBlock(currentBlock);
      return currentBlock;
    } catch (error) {
      logger.error('Error getting last processed block from Redis:', error);
      // Fallback to current block
      return await this.getCurrentBlockNumber();
    }
  }

  /**
   * Update last processed block in Redis
   */
  private async updateLastProcessedBlock(blockNumber: number): Promise<void> {
    try {
      const redis = redisClient.getClient();
      await redis.set(this.lastBlockRedisKey, blockNumber.toString());
    } catch (error) {
      logger.error('Error updating last processed block in Redis:', error);
    }
  }

  /**
   * Subscribe to events with retry mechanism
   * This handles filter expiration and automatically retries
   */
  async subscribeWithRetry(): Promise<void> {
    if (!this.contract) {
      throw new Error('Contract not initialized. Call initialize() first.');
    }

    const subscribeToEvent = (eventName: string, handler: (...args: any[]) => Promise<void>) => {
      const subscribe = () => {
        try {
          logger.info(`Subscribing to ${eventName} event...`);
          this.contract!.on(eventName, handler);
        } catch (error) {
          logger.error(`Subscribe error for ${eventName}:`, error);
          // Retry after delay
          setTimeout(() => {
            logger.info(`Retrying subscription to ${eventName} in ${this.retryDelayMs}ms...`);
            subscribe();
          }, this.retryDelayMs);
        }
      };
      
      subscribe();
    };

    // Subscribe to IssuerApplicationSubmitted with retry
    subscribeToEvent('IssuerApplicationSubmitted', async (
      issuer: string,
      name: string,
      requestedCategories: string[],
      proposedFixedFee: bigint,
      publicKey: string,
      stakeAmount: bigint,
      event: any
    ) => {
      try {
        await this.handleIssuerApplicationSubmitted({
          issuer,
          name,
          requestedCategories,
          proposedFixedFee: proposedFixedFee.toString(),
          publicKey,
          stakeAmount: stakeAmount.toString()
        }, {
          txHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber,
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error('Error handling IssuerApplicationSubmitted event:', error);
      }
    });

    // Subscribe to IssuerApproved with retry
    subscribeToEvent('IssuerApproved', async (
      caller: string,
      issuer: string,
      attestationUID: string,
      approveFixedFee: boolean,
      event: any
    ) => {
      try {
        await this.handleIssuerApproved({
          caller,
          issuer,
          attestationUID,
          approveFixedFee
        }, {
          txHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber,
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error('Error handling IssuerApproved event:', error);
      }
    });

    // Subscribe to IssuerRejected with retry
    subscribeToEvent('IssuerRejected', async (
      caller: string,
      issuer: string,
      event: any
    ) => {
      try {
        await this.handleIssuerRejected({
          caller,
          issuer
        }, {
          txHash: event.log.transactionHash,
          blockNumber: event.log.blockNumber,
          timestamp: Date.now()
        });
      } catch (error) {
        logger.error('Error handling IssuerRejected event:', error);
      }
    });

    this.isListening = true;
    logger.info('Started event subscription with retry mechanism');
  }

  private async handleIssuerApplicationSubmitted(
    event: IssuerApplicationSubmittedEvent,
    metadata: EventMetadata
  ): Promise<void> {
    try {
      logger.info('Processing IssuerApplicationSubmitted event', {
        issuer: event.issuer,
        name: event.name,
        txHash: metadata.txHash,
        blockNumber: metadata.blockNumber
      });

      await issuerService.handleApplicationSubmitted(event, metadata);
    } catch (error) {
      logger.error('Error handling IssuerApplicationSubmitted event:', error);
      // Implement retry logic here if needed
    }
  }

  private async handleIssuerApproved(
    event: IssuerApprovedEvent,
    metadata: EventMetadata
  ): Promise<void> {
    try {
      logger.info('Processing IssuerApproved event', {
        caller: event.caller,
        issuer: event.issuer,
        attestationUID: event.attestationUID,
        txHash: metadata.txHash,
        blockNumber: metadata.blockNumber
      });

      await issuerService.handleIssuerApproved(event, metadata);
    } catch (error) {
      logger.error('Error handling IssuerApproved event:', error);
      // Implement retry logic here if needed
    }
  }

  private async handleIssuerRejected(
    event: IssuerRejectedEvent,
    metadata: EventMetadata
  ): Promise<void> {
    try {
      logger.info('Processing IssuerRejected event', {
        caller: event.caller,
        issuer: event.issuer,
        txHash: metadata.txHash,
        blockNumber: metadata.blockNumber
      });

      await issuerService.handleIssuerRejected(event, metadata);
    } catch (error) {
      logger.error('Error handling IssuerRejected event:', error);
      // Implement retry logic here if needed
    }
  }

  // Get historical events using getLogs
  async getHistoricalEvents(fromBlock: number, toBlock: number | 'latest' = 'latest'): Promise<Log[]> {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const submittedEvent = this.contract!.interface.getEvent('IssuerApplicationSubmitted');
      const approvedEvent = this.contract!.interface.getEvent('IssuerApproved');
      const rejectedEvent = this.contract!.interface.getEvent('IssuerRejected');

      const filter = {
        address: config.blockchain.contractAddress,
        fromBlock,
        toBlock,
        topics: [
          [
            submittedEvent!.topicHash,
            approvedEvent!.topicHash,
            rejectedEvent!.topicHash
          ]
        ]
      };

      const logs = await this.rpcProvider.getLogs(filter);
      logger.info(`Retrieved ${logs.length} historical events from block ${fromBlock} to ${toBlock}`);
      
      return logs;
    } catch (error) {
      logger.error('Error getting historical events:', error);
      throw error;
    }
  }

  // Parse log to event data
  parseLog(log: Log): { eventName: string; args: any } | null {
    try {
      if (!this.contract) {
        throw new Error('Contract not initialized');
      }

      const parsedLog = this.contract.interface.parseLog({
        topics: log.topics,
        data: log.data
      });

      if (!parsedLog) {
        return null;
      }

      return {
        eventName: parsedLog.name,
        args: parsedLog.args
      };
    } catch (error) {
      logger.error('Error parsing log:', error);
      return null;
    }
  }

  async getCurrentBlockNumber(): Promise<number> {
    return await this.rpcProvider.getBlockNumber();
  }

  async getBlockTimestamp(blockNumber: number): Promise<number> {
    const block = await this.rpcProvider.getBlock(blockNumber);
    return block ? block.timestamp * 1000 : Date.now(); // Convert to milliseconds
  }

  isHealthy(): boolean {
    return this.contract !== null && this.rpcProvider !== null;
  }

  async disconnect(): Promise<void> {
    await this.stopListening();
    await this.stopPolling();
    
    if (this.wsProvider) {
      this.wsProvider.destroy();
    }
    
    logger.info('Blockchain service disconnected');
  }
}

export default new BlockchainService();