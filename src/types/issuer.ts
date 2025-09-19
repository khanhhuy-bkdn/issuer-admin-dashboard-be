export interface IssuerData {
  address: string;
  name: string;
  requestedCategories: string[];
  proposedFixedFee: string;
  publicKey: string;
  stakeAmount: string;
  status: IssuerStatus;
  attestationUID?: string;
  approveFixedFee?: boolean;
  submittedAt: number;
  updatedAt: number;
  txHash: string;
  blockNumber: number;
}

export enum IssuerStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected'
}

export interface IssuerApplicationSubmittedEvent {
  issuer: string;
  name: string;
  requestedCategories: string[];
  proposedFixedFee: string;
  publicKey: string;
  stakeAmount: string;
}

export interface IssuerApprovedEvent {
  caller: string;
  issuer: string;
  attestationUID: string;
  approveFixedFee: boolean;
}

export interface IssuerRejectedEvent {
  caller: string;
  issuer: string;
}

export interface EventMetadata {
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

export interface IssuerQueryParams {
  status?: IssuerStatus;
  limit?: number;
  offset?: number;
}

export interface IssuerListResponse {
  issuers: IssuerData[];
  total: number;
  limit: number;
  offset: number;
}