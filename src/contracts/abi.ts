// Smart Contract ABI for Issuer Management
export const ISSUER_CONTRACT_ABI = [
  `event IssuerApplicationSubmitted(address indexed issuer, string name, bytes32[] requestedCategories, uint256 proposedFixedFee, bytes publicKey, uint256 stakeAmount)`,
  `event IssuerApproved(address indexed caller, address indexed issuer, bytes32 attestationUID, bool approveFixedFee)`,
  `event IssuerRejected(address indexed caller, address indexed issuer)`,
  `event IssuerRevoked(address indexed caller, address indexed issuer, bytes32 attestationUID)`,
  `function getIssuerInfo(address issuer) view returns (tuple(address issuer, string name, bytes32[] categories, uint256 feePerCategory, tuple(bytes32 keyId, bytes publicKey, uint256 validFrom, uint256 validUntil, bool isActive, string provider)[] keyHistory, uint256 activeKeyIndex, uint256 registrationTime, bool isActive, uint256 revocationTime))`
];

// Event signatures for filtering
export const EVENT_SIGNATURES = {
  IssuerApplicationSubmitted: 'IssuerApplicationSubmitted(address,string,string[],uint256,bytes,uint256)',
  IssuerApproved: 'IssuerApproved(address,address,bytes32,bool)',
  IssuerRejected: 'IssuerRejected(address,address)',
  IssuerRevoked: 'IssuerRevoked(address,address,bytes32)'
} as const;

// Event topics (keccak256 hashes)
export const EVENT_TOPICS = {
  IssuerApplicationSubmitted: '0x' + require('crypto').createHash('sha3-256').update(EVENT_SIGNATURES.IssuerApplicationSubmitted).digest('hex'),
  IssuerApproved: '0x' + require('crypto').createHash('sha3-256').update(EVENT_SIGNATURES.IssuerApproved).digest('hex'),
  IssuerRejected: '0x' + require('crypto').createHash('sha3-256').update(EVENT_SIGNATURES.IssuerRejected).digest('hex'),
  IssuerRevoked: '0x' + require('crypto').createHash('sha3-256').update(EVENT_SIGNATURES.IssuerRevoked).digest('hex'),
} as const;