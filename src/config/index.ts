import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

export interface Config {
  blockchain: {
    rpcUrl: string;
    wssUrl?: string;
    contractAddress: string;
    startBlock: number;
  };
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  api: {
    port: number;
    prefix: string;
  };
  logging: {
    level: string;
    file: string;
  };
  monitoring: {
    healthCheckInterval: number;
    retryAttempts: number;
    retryDelay: number;
  };
}

const config: Config = {
  blockchain: {
    rpcUrl: process.env.RPC_URL || 'https://humanity-testnet.g.alchemy.com/public',
    wssUrl: process.env.WSS_URL || undefined,
    contractAddress: process.env.CONTRACT_ADDRESS || '',
    startBlock: parseInt(process.env.START_BLOCK || '0', 10),
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD && process.env.REDIS_PASSWORD.trim() !== '' ? process.env.REDIS_PASSWORD : undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },
  api: {
    port: parseInt(process.env.PORT || '3000', 10),
    prefix: process.env.API_PREFIX || '/api/v1',
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
  },
  monitoring: {
    healthCheckInterval: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000', 10),
    retryAttempts: parseInt(process.env.RETRY_ATTEMPTS || '3', 10),
    retryDelay: parseInt(process.env.RETRY_DELAY || '1000', 10),
  },
};

// Validation
if (!config.blockchain.contractAddress) {
  throw new Error('CONTRACT_ADDRESS is required');
}

export default config;