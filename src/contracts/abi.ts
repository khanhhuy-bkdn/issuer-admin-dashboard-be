// Smart Contract ABI for Issuer Management
export const ISSUER_CONTRACT_ABI = [
  `event IssuerApplicationSubmitted(address indexed issuer, string name, bytes32[] requestedCategories, uint256 proposedFixedFee, bytes publicKey, uint256 stakeAmount)`,
  `event IssuerApproved(address indexed caller, address indexed issuer, bytes32 attestationUID, bool approveFixedFee)`,
  `event IssuerRejected(address indexed caller, address indexed issuer)`
];

// Event signatures for filtering
export const EVENT_SIGNATURES = {
  IssuerApplicationSubmitted: 'IssuerApplicationSubmitted(address,string,string[],uint256,bytes,uint256)',
  IssuerApproved: 'IssuerApproved(address,address,bytes32,bool)',
  IssuerRejected: 'IssuerRejected(address,address)'
} as const;

// Event topics (keccak256 hashes)
export const EVENT_TOPICS = {
  IssuerApplicationSubmitted: '0x' + require('crypto').createHash('sha3-256').update(EVENT_SIGNATURES.IssuerApplicationSubmitted).digest('hex'),
  IssuerApproved: '0x' + require('crypto').createHash('sha3-256').update(EVENT_SIGNATURES.IssuerApproved).digest('hex'),
  IssuerRejected: '0x' + require('crypto').createHash('sha3-256').update(EVENT_SIGNATURES.IssuerRejected).digest('hex')
} as const;