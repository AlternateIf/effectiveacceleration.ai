import { BytesLike, getBytes, AbiCoder, hexlify, toUtf8String } from "ethers";

export enum JobState {
  OPEN = 0,
  TAKEN = 1,
  CLOSED = 2,
}

export enum JobEventType {
  JOB_CREATED = 1,
  JOB_TAKEN = 2,
  JOB_PAID = 3,
  JOB_UPDATED = 4,
  JOB_SIGNED = 5,
  JOB_COMPLETED = 6,
  JOB_DELIVERED = 7,
  JOB_CLOSED = 8,
  JOB_REOPENED = 9,
  JOB_RATED = 10,
  JOB_REFUNDED = 11,
  JOB_DISPUTED = 12,
  JOB_ARBITRATED = 13,
  JOB_ARBITRATOR_CHANGED = 14,
  JOB_ARBITRATION_REFUSED = 15,
  JOB_ADD_WHITELISTED_WORKER = 16,
  JOB_REMOVE_WHITELISTED_WORKER = 17,
  COLLATERAL_WITHDRAWN = 18,

  WORKER_MESSAGE = 21,
  OWNER_MESSAGE = 22,
}

export type JobPostEvent = {
  title: string;
  contentHash: string;
  multipleApplicants: boolean;
  tags: string[];
  token: string;
  amount: bigint;
  maxTime: number;
  deliveryMethod: string;
  arbitratorRequired: boolean;
  arbitrator: string;
  allowedWorkers: string[];
};

export type JobUpdateEvent = {
  title: string;
  contentHash: string;
  amount: bigint;
  maxTime: number;
  arbitrator: string;
  whitelistWorkers: boolean
};

export type JobSignedEvent = {
  revision: number;
  signatire: string;
};

export type JobRatedEvent = {
  rating: number;
  review: string;
}

export type JobDisputedEvent = {
  sessionKey: string; // Creator's and worker's session key, encrypted for arbitrator
  content: string; // Dispute content encrypted by contender + arbitrator shared secret
}

export type JobArbitratedEvent = {
  creatorShare: number;
  workerShare: number;
  reason: string;
}

export const decodeJobPostEvent = (rawData: BytesLike): JobPostEvent => {
  const decoded = AbiCoder.defaultAbiCoder().decode(["string", "bytes32", "bool", "string[]", "address", "uint256", "uint32", "string", "bool", "address", "address[]"], rawData);
  return {
    title: decoded[0],
    contentHash: decoded[1],
    multipleApplicants: decoded[2],
    tags: decoded[3].toArray(),
    token: decoded[4],
    amount: decoded[5],
    maxTime: Number(decoded[6]),
    deliveryMethod: decoded[7],
    arbitratorRequired: decoded[8],
    arbitrator: decoded[9],
    allowedWorkers: decoded[10].toArray(),
  };
};

export const decodeJobUpdatedEvent = (rawData: BytesLike): JobUpdateEvent => {
  const decoded = AbiCoder.defaultAbiCoder().decode(["string", "bytes32", "uint256", "uint32", "address", "bool"], rawData);
  return {
    title: decoded[0],
    contentHash: decoded[1],
    amount: decoded[2],
    maxTime: Number(decoded[3]),
    arbitrator: decoded[4],
    whitelistWorkers: decoded[5],
  };
};

export const decodeJobSignedEvent = (rawData: BytesLike): JobSignedEvent => {
  const bytes = getBytes(rawData);
  return {
    revision: new DataView(bytes.buffer, 0).getUint16(0),
    signatire: hexlify(bytes.slice(2)),
  };
}

export const decodeJobRatedEvent = (rawData: BytesLike): JobRatedEvent => {
  const bytes = getBytes(rawData);

  return {
    rating: new DataView(bytes.buffer, 0).getUint8(0),
    review: toUtf8String(bytes.slice(1)),
  };
};

export const decodeJobDisputedEvent = (rawData: BytesLike): JobDisputedEvent => {
  const bytes = getBytes(rawData);
  return {
    sessionKey: hexlify(bytes.slice(0, 32)),
    content: hexlify(bytes.slice(32)),
  };
}

export const decodeJobArbitratedEvent = (rawData: BytesLike): JobArbitratedEvent => {
  const bytes = getBytes(rawData);
  return {
    creatorShare: new DataView(bytes.buffer, 0).getUint16(0),
    workerShare: new DataView(bytes.buffer, 0).getUint16(2),
    reason: hexlify(bytes.slice(4)),
  };
}