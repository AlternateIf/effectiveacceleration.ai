// main.js
// This is the main executable of the squid indexer.

// EvmBatchProcessor is the class responsible for data retrieval and processing.
import { EvmBatchProcessor } from "@subsquid/evm-processor";
// TypeormDatabase is the class responsible for data storage.
import { TypeormDatabase } from "@subsquid/typeorm-store";

import * as marketplaceAbi from "./abi/MarketplaceV1";
import * as marketplaceDataAbi from "./abi/MarketplaceDataV1";
import Config from "effectiveacceleration-contracts/scripts/config.json";

import {
  JobEvent,
  Job,
  Marketplace,
  JobCreatedEvent,
  JobUpdatedEvent,
  JobSignedEvent,
  JobRatedEvent,
  JobDisputedEvent,
  JobArbitratedEvent,
  JobMessageEvent,
  JobRoles,
  Review,
  User,
  Arbitrator,
} from "./model";
import {
  decodeJobArbitratedEvent,
  decodeJobCreatedEvent,
  decodeJobDisputedEvent,
  decodeJobMessageEvent,
  decodeJobRatedEvent,
  decodeJobSignedEvent,
  decodeJobUpdatedEvent,
  JobEventType,
  JobState,
} from "effectiveacceleration-contracts";
import { toBigInt, ZeroAddress, ZeroHash } from "ethers";

// const MARKETPLACE_CONTRACT_ADDRESS =
//   "0x60a1561455c9Bd8fe6B0F05976d7F84ff2eff5a3".toLowerCase();
// const MARKETPLACEDATA_CONTRACT_ADDRESS =
//   "0xB43014F1328dd3732f60C06107F1b5a03eea60AF".toLowerCase();

const MARKETPLACE_CONTRACT_ADDRESS = Config.marketplaceAddress.toLowerCase();
const MARKETPLACEDATA_CONTRACT_ADDRESS =
  Config.marketplaceDataAddress.toLowerCase();

// First we configure data retrieval.
const processor = new EvmBatchProcessor()
  // // SQD Network gateways are the primary source of blockchain data in
  // // squids, providing pre-filtered data in chunks of roughly 1-10k blocks.
  // // Set this for a fast sync.
  .setGateway(process.env.GATEWAY as any)
  // // Another data source squid processors can use is chain RPC.
  // // In this particular squid it is used to retrieve the very latest chain data
  // // (including unfinalized blocks) in real time. It can also be used to
  // //   - make direct RPC queries to get extra data during indexing
  // //   - sync a squid without a gateway (slow)
  // .setRpcEndpoint('https://rpc.ankr.com/eth')
  .setRpcEndpoint(process.env.RPC_ENDPOINT)
  // The processor needs to know how many newest blocks it should mark as "hot".
  // If it detects a blockchain fork, it will roll back any changes to the
  // database made due to orphaned blocks, then re-run the processing for the
  // main chain blocks.
  .setFinalityConfirmation(0)
  // .addXXX() methods request data items.
  // Other .addXXX() methods (.addTransaction(), .addTrace(), .addStateDiff()
  // on EVM) are similarly feature-rich.
  .addLog({
    address: [MARKETPLACE_CONTRACT_ADDRESS, MARKETPLACEDATA_CONTRACT_ADDRESS],
    range: {
      from: process.env.BLOCK_FROM ? Number(process.env.BLOCK_FROM) : 0,
    },
  });

// TypeormDatabase objects store the data to Postgres. They are capable of
// handling the rollbacks that occur due to blockchain forks.
//
// There are also Database classes for storing data to files and BigQuery
// datasets.
const db = new TypeormDatabase({ supportHotBlocks: true });

// The processor.run() call executes the data processing. Its second argument is
// the handler function that is executed once on each batch of data. Processor
// object provides the data via "ctx.blocks". However, the handler can contain
// arbitrary TypeScript code, so it's OK to bring in extra data from IPFS,
// direct RPC calls, external APIs etc.
processor.run(db, async (ctx) => {
  // bluntly prevent excessive logs of HTTP 429 errors
  (ctx._chain.client as any).log = undefined;

  const jobCache: Record<string, Job> = {};
  const userCache: Record<string, User> = {};
  const arbitratorCache: Record<string, Arbitrator> = {};
  const eventList: JobEvent[] = [];
  const reviewList: Review[] = [];
  let marketplace: Marketplace | undefined;

  for (const block of ctx.blocks) {
    if (block.logs.length) {
      console.log("Processing block", block.header.height, block.logs.length);
    } else {
      continue;
    }

    for (const log of block.logs) {
      if (log.address === MARKETPLACE_CONTRACT_ADDRESS) {
        marketplace =
          marketplace ??
          (await ctx.store.findOneBy(Marketplace, {
            id: MARKETPLACE_CONTRACT_ADDRESS,
          }))!;
        if (!marketplace) {
          marketplace = new Marketplace({
            id: MARKETPLACE_CONTRACT_ADDRESS,
            paused: false,
          });
        }

        const eventIndex = Object.values(marketplaceAbi.events).findIndex(
          (event) => event.topic === log.topics[0]
        );
        if (eventIndex !== -1) {
          console.log(
            "Processing Marketplace Event Log:",
            Object.keys(marketplaceAbi.events)[eventIndex]
          );
        }
        switch (log.topics[0]) {
          case marketplaceAbi.events.Initialized.topic: {
            const { version } = marketplaceAbi.events.Initialized.decode(log);

            // TODO: workaround for currently deployed contracts, remove after upgrade
            if (process.env.GATEWAY?.includes("arbitrum")) {
              const contract = new marketplaceAbi.Contract(
                ctx,
                block.header,
                MARKETPLACE_CONTRACT_ADDRESS
              );
              try {
                const unicrowAddress = await contract.unicrowAddress();
                const unicrowDisputeAddress =
                  await contract.unicrowDisputeAddress();
                const unicrowArbitratorAddress =
                  await contract.unicrowArbitratorAddress();
                const treasuryAddress = await contract.treasuryAddress();
                const unicrowMarketplaceFee =
                  await contract.unicrowMarketplaceFee();
                const owner = await contract.owner();

                marketplace = new Marketplace({
                  id: MARKETPLACE_CONTRACT_ADDRESS,
                  unicrowAddress,
                  unicrowDisputeAddress,
                  unicrowArbitratorAddress,
                  treasuryAddress,
                  owner,
                  unicrowMarketplaceFee,
                  marketplaceData: MARKETPLACEDATA_CONTRACT_ADDRESS,
                  paused: false,
                });
              } catch (e) {
                const unicrowAddress = ZeroAddress;
                const unicrowDisputeAddress = ZeroAddress;
                const unicrowArbitratorAddress = ZeroAddress;
                const treasuryAddress = ZeroAddress;
                const owner = ZeroAddress;
                const unicrowMarketplaceFee = 0;

                marketplace = new Marketplace({
                  id: MARKETPLACE_CONTRACT_ADDRESS,
                  unicrowAddress,
                  unicrowDisputeAddress,
                  unicrowArbitratorAddress,
                  treasuryAddress,
                  owner,
                  unicrowMarketplaceFee,
                  marketplaceData: MARKETPLACEDATA_CONTRACT_ADDRESS,
                  paused: false,
                });
              }
            }

            marketplace.version = Number(version);

            break;
          }
          case marketplaceAbi.events.MarketplaceDataAddressChanged.topic: {
            const { marketplaceDataAddress } =
              marketplaceAbi.events.MarketplaceDataAddressChanged.decode(log);
            marketplace.marketplaceData = marketplaceDataAddress;
            break;
          }
          case marketplaceAbi.events.TreasuryAddressChanged.topic: {
            const { treasuryAddress } =
              marketplaceAbi.events.TreasuryAddressChanged.decode(log);
            marketplace.treasuryAddress = treasuryAddress;
            break;
          }
          case marketplaceAbi.events.UnicrowAddressesChanged.topic: {
            const {
              unicrowAddress,
              unicrowArbitratorAddress,
              unicrowDisputeAddress,
            } = marketplaceAbi.events.UnicrowAddressesChanged.decode(log);
            marketplace.unicrowAddress = unicrowAddress;
            marketplace.unicrowArbitratorAddress = unicrowArbitratorAddress;
            marketplace.unicrowDisputeAddress = unicrowDisputeAddress;
            break;
          }
          case marketplaceAbi.events.UnicrowMarketplaceFeeChanged.topic: {
            const { unicrowMarketplaceFee } =
              marketplaceAbi.events.UnicrowMarketplaceFeeChanged.decode(log);
            marketplace.unicrowMarketplaceFee = unicrowMarketplaceFee;
            break;
          }
          case marketplaceAbi.events.VersionChanged.topic: {
            const { version } =
              marketplaceAbi.events.VersionChanged.decode(log);
            marketplace.version = Number(version);
            break;
          }
          case marketplaceAbi.events.Paused.topic: {
            marketplace.paused = true;
            break;
          }
          case marketplaceAbi.events.Unpaused.topic: {
            marketplace.paused = false;
            break;
          }
          case marketplaceAbi.events.OwnershipTransferred.topic: {
            const { newOwner } =
              marketplaceAbi.events.OwnershipTransferred.decode(log);
            marketplace.owner = newOwner;
            break;
          }
          default:
            break;
        }
      } else if (log.address === MARKETPLACEDATA_CONTRACT_ADDRESS) {
        const eventIndex = Object.values(marketplaceDataAbi.events).findIndex(
          (event) => event.topic === log.topics[0]
        );
        if (eventIndex !== -1) {
          console.log(
            "Processing MarketplaceData Event Log:",
            Object.keys(marketplaceDataAbi.events)[eventIndex]
          );
        }

        switch (log.topics[0]) {
          case marketplaceDataAbi.events.UserRegistered.topic: {
            const userRegisteredEvent =
              marketplaceDataAbi.events.UserRegistered.decode(log);

            const user = new User({
              id: userRegisteredEvent.addr,
              address: userRegisteredEvent.addr,
              publicKey: userRegisteredEvent.pubkey,
              name: userRegisteredEvent.name,
              bio: userRegisteredEvent.bio,
              avatar: userRegisteredEvent.avatar,
              reputationUp: 0,
              reputationDown: 0,
              averageRating: 0,
              numberOfReviews: 0,
              myReviews: [],
              reviews: [],
            });

            userCache[userRegisteredEvent.addr] = user;
            break;
          }
          case marketplaceDataAbi.events.UserUpdated.topic: {
            const userUpdatedEvent =
              marketplaceDataAbi.events.UserUpdated.decode(log);

            const user =
              userCache[userUpdatedEvent.addr] ??
              (await ctx.store.findOneByOrFail(User, {
                id: userUpdatedEvent.addr,
              }))!;
            userCache[userUpdatedEvent.addr] = user;

            user.name = userUpdatedEvent.name;
            user.bio = userUpdatedEvent.bio;
            user.avatar = userUpdatedEvent.avatar;

            userCache[userUpdatedEvent.addr] = user;
            break;
          }
          case marketplaceDataAbi.events.ArbitratorRegistered.topic: {
            const arbitratorRegisteredEvent =
              marketplaceDataAbi.events.ArbitratorRegistered.decode(log);

            const arbitrator = new Arbitrator({
              id: arbitratorRegisteredEvent.addr,
              address: arbitratorRegisteredEvent.addr,
              publicKey: arbitratorRegisteredEvent.pubkey,
              name: arbitratorRegisteredEvent.name,
              bio: arbitratorRegisteredEvent.bio,
              avatar: arbitratorRegisteredEvent.avatar,
              fee: arbitratorRegisteredEvent.fee,
              refusedCount: 0,
              settledCount: 0,
            });

            arbitratorCache[arbitratorRegisteredEvent.addr] = arbitrator;
            break;
          }
          case marketplaceDataAbi.events.ArbitratorUpdated.topic: {
            const arbitratorUpdatedEvent =
              marketplaceDataAbi.events.ArbitratorUpdated.decode(log);

            const arbitrator =
              arbitratorCache[arbitratorUpdatedEvent.addr] ??
              (await ctx.store.findOneByOrFail(Arbitrator, {
                id: arbitratorUpdatedEvent.addr,
              }))!;
            arbitratorCache[arbitratorUpdatedEvent.addr] = arbitrator;

            arbitrator.name = arbitratorUpdatedEvent.name;
            arbitrator.bio = arbitratorUpdatedEvent.bio;
            arbitrator.avatar = arbitratorUpdatedEvent.avatar;

            arbitratorCache[arbitratorUpdatedEvent.addr] = arbitrator;
            break;
          }
          case marketplaceDataAbi.events.JobEvent.topic: {
            const decoded = marketplaceDataAbi.events.JobEvent.decode(log);

            const jobId = decoded.jobId.toString();
            console.log(
              "Processing Job Event Type:",
              JobEventType[decoded.eventData.type_],
              "jobId:",
              jobId
            );
            let job: Job =
              jobCache[jobId] ??
              (await ctx.store.findOneBy(Job, { id: jobId }))!;
            jobCache[jobId] = job;

            const event = decoded.eventData;
            const jobEvent = new JobEvent({
              address: decoded.eventData.address_,
              data: decoded.eventData.data_,
              timestamp: decoded.eventData.timestamp_,
              type: decoded.eventData.type_,
              job: new Job({ id: decoded.jobId.toString() }),
              id: log.id,
            });

            switch (Number(event.type_)) {
              case JobEventType.Created: {
                const jobCreated = decodeJobCreatedEvent(event.data_);

                if (!job) {
                  job = new Job({
                    roles: new JobRoles({
                      creator: ZeroAddress,
                      worker: ZeroAddress,
                      arbitrator: ZeroAddress,
                    }),
                  });

                  job.id = jobId;
                  job.title = jobCreated.title;
                  job.contentHash = jobCreated.contentHash as `0x${string}`;
                  job.multipleApplicants = jobCreated.multipleApplicants;
                  job.tags = jobCreated.tags;
                  job.token = jobCreated.token as `0x${string}`;
                  job.amount = jobCreated.amount;
                  job.maxTime = jobCreated.maxTime;
                  job.deliveryMethod = jobCreated.deliveryMethod;
                  job.roles.arbitrator = jobCreated.arbitrator as `0x${string}`;
                  job.whitelistWorkers = jobCreated.whitelistWorkers;

                  // defaults
                  job.collateralOwed = 0n;
                  job.disputed = false;
                  job.state = JobState.Open;
                  job.escrowId = 0n;
                  job.rating = 0;
                  job.roles.creator = event.address_ as `0x${string}`;
                  job.roles.worker = ZeroAddress as `0x${string}`;
                  job.timestamp = event.timestamp_;
                  job.resultHash = ZeroHash as `0x${string}`;
                  job.allowedWorkers = [];
                  job.events = [];
                }
                jobCache[jobId] = job;

                jobEvent.details = new JobCreatedEvent(jobCreated);

                break;
              }
              case JobEventType.Taken: {
                if (!job) {
                  throw new Error("Job must be created before it can be taken");
                }

                job.roles.worker = event.address_ as `0x${string}`;
                job.state = JobState.Taken;
                job.escrowId = toBigInt(event.data_);

                break;
              }
              case JobEventType.Paid: {
                if (!job) {
                  throw new Error("Job must be created before it can be paid");
                }

                job.roles.worker = event.address_ as `0x${string}`;
                job.state = JobState.Taken;
                job.escrowId = toBigInt(event.data_);

                break;
              }
              case JobEventType.Updated: {
                if (!job) {
                  throw new Error(
                    "Job must be created before it can be updated"
                  );
                }

                const jobUpdated = decodeJobUpdatedEvent(event.data_);
                job.title = jobUpdated.title;
                job.contentHash = jobUpdated.contentHash as `0x${string}`;
                job.tags = jobUpdated.tags;
                job.maxTime = jobUpdated.maxTime;
                job.roles.arbitrator = jobUpdated.arbitrator as `0x${string}`;
                job.whitelistWorkers = jobUpdated.whitelistWorkers;

                jobEvent.details = new JobUpdatedEvent(jobUpdated);

                if (job.amount !== jobUpdated.amount) {
                  if (jobUpdated.amount > job.amount) {
                    job.collateralOwed = 0n; // Clear the collateral record
                  } else {
                    const difference = job.amount - jobUpdated.amount;

                    if (
                      Number(event.timestamp_) >=
                      Number(job.timestamp) + 60 * 60 * 24
                    ) {
                      job.collateralOwed = 0n; // Clear the collateral record
                    } else {
                      job.collateralOwed += difference; // Record to owe later
                    }
                  }

                  job.amount = jobUpdated.amount;
                }

                break;
              }
              case JobEventType.Signed: {
                if (!job) {
                  throw new Error(
                    "Job must be created before it can be signed"
                  );
                }

                const jobSigned = decodeJobSignedEvent(event.data_);
                jobEvent.details = new JobSignedEvent(jobSigned);

                break;
              }
              case JobEventType.Completed: {
                if (!job) {
                  throw new Error(
                    "Job must be created before it can be completed"
                  );
                }

                job.state = JobState.Closed;

                break;
              }
              case JobEventType.Delivered: {
                if (!job) {
                  throw new Error(
                    "Job must be created before it can be delivered"
                  );
                }

                job.resultHash = event.data_;

                const userId = job.roles.worker;
                const user: User =
                  userCache[userId] ??
                  (await ctx.store.findOneByOrFail(User, { id: userId }))!;
                user.reputationUp++;
                userCache[userId] = user;

                break;
              }
              case JobEventType.Closed: {
                if (!job) {
                  throw new Error(
                    "Job must be created before it can be closed"
                  );
                }

                job.state = JobState.Closed;
                if (
                  Number(event.timestamp_) >=
                  Number(job.timestamp) + 60 * 60 * 24
                ) {
                  job.collateralOwed = 0n; // Clear the collateral record
                } else {
                  job.collateralOwed += job.amount;
                }

                break;
              }
              case JobEventType.Reopened: {
                if (!job) {
                  throw new Error(
                    "Job must be created before it can be reopened"
                  );
                }

                job.state = JobState.Open;
                job.resultHash = ZeroHash as `0x${string}`;
                job.timestamp = event.timestamp_;

                if (job.collateralOwed < job.amount) {
                  job.collateralOwed = 0n;
                } else {
                  job.collateralOwed -= job.amount;
                }

                break;
              }
              case JobEventType.Rated: {
                if (!job) {
                  throw new Error("Job must be created before it can be rated");
                }

                const jobRated = decodeJobRatedEvent(event.data_);
                jobEvent.details = new JobRatedEvent(jobRated);
                job.rating = jobRated.rating;

                const userId = job.roles.worker;
                let user: User =
                  userCache[userId] ??
                  (await ctx.store.findOneByOrFail(User, { id: userId }))!;

                user.averageRating =
                  (user.averageRating * user.numberOfReviews +
                    jobRated.rating * 10000) /
                  (user.numberOfReviews + 1);
                user.numberOfReviews++;

                userCache[userId] = user;

                reviewList.push(
                  new Review({
                    id: log.id,
                    rating: jobRated.rating,
                    jobId: Number(decoded.jobId),
                    text: jobRated.review,
                    timestamp: event.timestamp_,
                    user: job.roles.worker,
                    reviewer: job.roles.creator,
                    userLoaded: new User({ id: job.roles.worker }),
                    reviewerLoaded: new User({ id: job.roles.creator }),
                  })
                );

                break;
              }
              case JobEventType.Refunded: {
                if (!job) {
                  throw new Error(
                    "Job must be created before it can be refunded"
                  );
                }

                const byWorker = event.address_ === job.roles.worker;
                if (byWorker) {
                  job.allowedWorkers = job.allowedWorkers.filter(
                    (address) => address !== job!.roles.worker
                  );

                  const userId = job.roles.worker;
                  const user: User =
                    userCache[userId] ??
                    (await ctx.store.findOneByOrFail(User, { id: userId }))!;
                  user.reputationDown++;
                  userCache[userId] = user;
                }

                job.roles.worker = ZeroAddress as `0x${string}`;
                job.state = JobState.Open;
                job.escrowId = 0n;

                break;
              }
              case JobEventType.Disputed: {
                if (!job) {
                  throw new Error(
                    "Job must be created before it can be disputed"
                  );
                }

                const jobDisputed = decodeJobDisputedEvent(event.data_);
                jobEvent.details = new JobDisputedEvent(jobDisputed);
                job.disputed = true;

                break;
              }
              case JobEventType.Arbitrated: {
                if (!job) {
                  throw new Error(
                    "Job must be created before it can be arbitrated"
                  );
                }

                const jobArbitrated = decodeJobArbitratedEvent(event.data_);
                jobEvent.details = new JobArbitratedEvent(jobArbitrated);
                job.state = JobState.Closed;
                job.collateralOwed = job.collateralOwed +=
                  jobArbitrated.creatorAmount;

                const arbitrator =
                  arbitratorCache[job.roles.arbitrator] ??
                  (await ctx.store.findOneByOrFail(Arbitrator, {
                    id: job.roles.arbitrator,
                  }))!;
                arbitratorCache[job.roles.arbitrator] = arbitrator;
                arbitrator.settledCount++;

                break;
              }
              case JobEventType.ArbitrationRefused: {
                if (!job) {
                  throw new Error(
                    "Job must be created before it can be refused arbitration"
                  );
                }

                job.roles.arbitrator = ZeroAddress as `0x${string}`;

                const arbitrator =
                  arbitratorCache[job.roles.arbitrator] ??
                  (await ctx.store.findOneByOrFail(Arbitrator, {
                    id: job.roles.arbitrator,
                  }))!;
                arbitratorCache[job.roles.arbitrator] = arbitrator;
                arbitrator.refusedCount++;

                break;
              }
              case JobEventType.WhitelistedWorkerAdded: {
                if (!job) {
                  throw new Error(
                    "Job must be created before workers can be whitelisted"
                  );
                }

                job.allowedWorkers.push(event.address_);

                break;
              }
              case JobEventType.WhitelistedWorkerRemoved: {
                if (!job) {
                  throw new Error(
                    "Job must be created before workers can be whitelisted"
                  );
                }

                job.allowedWorkers = job.allowedWorkers.filter(
                  (address) => address !== (event.address_ as `0x${string}`)
                );

                break;
              }
              case JobEventType.CollateralWithdrawn: {
                if (!job) {
                  throw new Error(
                    "Job must be created before collateral can be withdrawn"
                  );
                }

                job.collateralOwed = 0n;

                break;
              }
              case JobEventType.OwnerMessage:
              case JobEventType.WorkerMessage: {
                if (!job) {
                  throw new Error(
                    "Job must be created before messages can be exchanged"
                  );
                }

                const jobMessage = decodeJobMessageEvent(event.data_);
                jobEvent.details = new JobMessageEvent(jobMessage);

                break;
              }
              default:
                break;
            }

            eventList.push(jobEvent);
            break;
          }
          default:
            break;
        }
      }
    }
  }

  if (marketplace) {
    await ctx.store.upsert(marketplace);
  }

  await ctx.store.upsert(Object.values(userCache));
  await ctx.store.upsert(Object.values(arbitratorCache));
  await ctx.store.upsert(Object.values(jobCache));
  await ctx.store.upsert(eventList);
  await ctx.store.upsert(reviewList);
});