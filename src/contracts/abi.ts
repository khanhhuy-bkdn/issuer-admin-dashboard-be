// Smart Contract ABI for Issuer Management
export const ISSUER_CONTRACT_ABI = [
  `event IssuerApplicationSubmitted(address indexed issuer, string name, bytes32[] requestedCategories, uint256 proposedFixedFee, bytes publicKey, uint256 stakeAmount)`,
  `event IssuerApproved(address indexed caller, address indexed issuer, bytes32 attestationUID, bool approveFixedFee)`,
  `event IssuerRejected(address indexed caller, address indexed issuer)`,
  `event IssuerRevoked(address indexed caller, address indexed issuer, bytes32 attestationUID)`,
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "issuer",
        "type": "address"
      }
    ],
    "name": "getIssuerInfo",
    "outputs": [
      {
        "components": [
          {
            "internalType": "address",
            "name": "issuer",
            "type": "address"
          },
          {
            "internalType": "bool",
            "name": "isActive",
            "type": "bool"
          },
          {
            "internalType": "uint256",
            "name": "feePerCategory",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "activeKeyIndex",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "registrationTime",
            "type": "uint256"
          },
          {
            "internalType": "uint256",
            "name": "revocationTime",
            "type": "uint256"
          },
          {
            "internalType": "string",
            "name": "name",
            "type": "string"
          },
          {
            "internalType": "bytes32[]",
            "name": "categories",
            "type": "bytes32[]"
          },
          {
            "components": [
              {
                "internalType": "bytes32",
                "name": "keyId",
                "type": "bytes32"
              },
              {
                "internalType": "uint256",
                "name": "validFrom",
                "type": "uint256"
              },
              {
                "internalType": "uint256",
                "name": "validUntil",
                "type": "uint256"
              },
              {
                "internalType": "bool",
                "name": "isActive",
                "type": "bool"
              },
              {
                "internalType": "bytes",
                "name": "publicKey",
                "type": "bytes"
              },
              {
                "internalType": "string",
                "name": "provider",
                "type": "string"
              }
            ],
            "internalType": "struct IIssuerRegistry.KeyInfo[]",
            "name": "keyHistory",
            "type": "tuple[]"
          }
        ],
        "internalType": "struct IIssuerRegistry.IssuerInfo",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }]

// Event signatures for filtering
export const EVENT_SIGNATURES = {
  IssuerApplicationSubmitted: 'IssuerApplicationSubmitted(address,string,bytes32[],uint256,bytes,uint256)',
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