# Issuer Admin Backend

A Node.js backend service for monitoring and managing smart contract issuer events using Redis for data storage.

## Features

- **Smart Contract Event Monitoring**: Listens to `IssuerApplicationSubmitted`, `IssuerApproved`, and `IssuerRejected` events
- **Redis Data Storage**: Efficient storage and querying of issuer data
- **RESTful API**: Endpoints for retrieving issuer information
- **Historical Data Sync**: Backfill tool for syncing past events
- **Health Monitoring**: Comprehensive health checks and monitoring
- **TypeScript**: Full TypeScript support with strict typing

## Prerequisites

- Node.js 18+ 
- Redis Server
- Ethereum RPC endpoint (Alchemy, Infura, or public RPC)

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd issuer-admin-be
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment configuration:
```bash
cp .env.example .env
```

4. Configure environment variables in `.env`:
```env
# Blockchain Configuration
RPC_URL=https://eth-mainnet.alchemyapi.io/v2/your-api-key
WSS_URL=wss://eth-mainnet.alchemyapi.io/v2/your-api-key
CONTRACT_ADDRESS=0x1234567890123456789012345678901234567890
START_BLOCK=18000000

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# API Configuration
PORT=3000
API_PREFIX=/api/v1

# Logging
LOG_LEVEL=info
LOG_FILE=logs/app.log
```

## Usage

### Development

```bash
# Start in development mode with hot reload
npm run dev

# Build the project
npm run build

# Start production server
npm start
```

### Backfill Historical Data

```bash
# Sync all historical events from START_BLOCK
npm run backfill

# Sync from specific block
npm run backfill -- --from-block 18500000

# Reset all data and sync from beginning
npm run backfill -- --reset

# Check backfill status
npm run backfill -- --status
```

## API Endpoints

### Issuer Management

- `GET /api/v1/issuers` - Get all issuers
- `GET /api/v1/issuers?status=pending` - Get issuers by status
- `GET /api/v1/issuers?status=approved` - Get approved issuers
- `GET /api/v1/issuers?status=rejected` - Get rejected issuers
- `GET /api/v1/issuer/:address` - Get specific issuer by address

### Shortcuts

- `GET /api/v1/issuers/pending` - Get pending issuers
- `GET /api/v1/issuers/approved` - Get approved issuers
- `GET /api/v1/issuers/rejected` - Get rejected issuers
- `GET /api/v1/issuers/stats` - Get issuer statistics

### Health Monitoring

- `GET /healthz` - Basic health check
- `GET /healthz/detailed` - Detailed health with metrics
- `GET /healthz/ready` - Readiness probe (Kubernetes)
- `GET /healthz/live` - Liveness probe (Kubernetes)

## Redis Schema

### Data Structure

```redis
# Individual issuer data
HSET issuer:0x1234... 
  name "Issuer A" 
  requestedCategories '["CAT1","CAT2"]' 
  proposedFixedFee 1000 
  publicKey 0xabcdef... 
  stakeAmount 500 
  status "pending"
  submittedAt "2024-01-01T00:00:00.000Z"
  blockNumber 18000000
  transactionHash 0x...

# Status indexes for efficient querying
SADD issuers:pending 0x1234...
SADD issuers:approved 0x5678...
SADD issuers:rejected 0x9abc...

# Metadata
HSET metadata:backfill
  lastProcessedBlock 18500000
  lastUpdated "2024-01-01T00:00:00.000Z"
```

## Smart Contract Events

### IssuerApplicationSubmitted
```solidity
event IssuerApplicationSubmitted(
    address indexed issuer,
    string name,
    string[] requestedCategories,
    uint256 proposedFixedFee,
    bytes32 publicKey,
    uint256 stakeAmount
);
```

### IssuerApproved
```solidity
event IssuerApproved(
    address indexed caller,
    address indexed issuer,
    bytes32 attestationUID,
    bool approveFixedFee
);
```

### IssuerRejected
```solidity
event IssuerRejected(
    address indexed caller,
    address indexed issuer
);
```

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Smart         │    │   Blockchain    │    │   Redis         │
│   Contract      │───▶│   Service       │───▶│   Database      │
│   Events        │    │   (Ethers v6)   │    │   (ioredis)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   REST API      │    │   Issuer        │    │   Controllers   │
│   (Express)     │◀───│   Service       │◀───│   & Routes      │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## Monitoring & Logging

- **Winston Logger**: Structured logging with file and console outputs
- **Health Checks**: Redis and blockchain connectivity monitoring
- **Error Handling**: Comprehensive error handling with retry mechanisms
- **Graceful Shutdown**: Proper cleanup of connections and resources

## Development

### Project Structure

```
src/
├── config/           # Configuration management
├── contracts/        # Smart contract ABI and interfaces
├── controllers/      # API controllers
├── database/         # Redis client and connection
├── middleware/       # Express middleware
├── routes/          # API routes
├── scripts/         # Utility scripts (backfill)
├── services/        # Business logic services
├── types/           # TypeScript type definitions
├── utils/           # Utility functions
├── app.ts           # Express application setup
└── server.ts        # Application entry point
```

### Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build TypeScript to JavaScript
- `npm start` - Start production server
- `npm run backfill` - Run historical data sync
- `npm run lint` - Run ESLint (if configured)
- `npm test` - Run tests (if configured)

## Environment Variables

| Variable | Description | Default |
|----------|-------------|----------|
| `RPC_URL` | Ethereum RPC endpoint | Required |
| `WSS_URL` | Ethereum WebSocket endpoint | Optional |
| `CONTRACT_ADDRESS` | Smart contract address | Required |
| `START_BLOCK` | Starting block for event sync | 0 |
| `REDIS_HOST` | Redis server host | localhost |
| `REDIS_PORT` | Redis server port | 6379 |
| `REDIS_PASSWORD` | Redis password | Empty |
| `REDIS_DB` | Redis database number | 0 |
| `PORT` | API server port | 3000 |
| `API_PREFIX` | API route prefix | /api/v1 |
| `LOG_LEVEL` | Logging level | info |
| `LOG_FILE` | Log file path | logs/app.log |

## License

MIT License