// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
//import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@arbitrum/nitro-contracts/src/precompiles/ArbSys.sol";
import {getIPFSCID} from "./libraries/IPFS.sol";

import "./unicrow/Unicrow.sol";
import "./unicrow/UnicrowDispute.sol";
import "./unicrow/UnicrowArbitrator.sol";
import "./unicrow/UnicrowTypes.sol";

// import "hardhat/console.sol";

uint256 constant ARBITRUM_NOVA_CHAINID = 0xa4ba;
uint256 constant ARBITRUM_GOERLI_CHAINID = 0x66eed;
uint256 constant ARBITRUM_SEPOLIA_CHAINID = 0x66eee;
// https://github.com/OffchainLabs/arbitrum-classic/blob/master/docs/sol_contract_docs/md_docs/arb-os/arbos/builtin/ArbSys.md
address constant ARBSYS_ADDRESS = address(100);

// a discussion thread looks like this:
// object (type jobpost (1 byte), address(20 bytes), index_ of cid of input text(8 bytes),

uint8 constant JOB_STATE_OPEN = 0;
uint8 constant JOB_STATE_TAKEN = 1;
uint8 constant JOB_STATE_CLOSED = 2;

uint32 constant _24_HRS = 60 * 60 * 24;

struct JobRoles {
    address creator;
    address arbitrator;
    address worker; // who took the job
}

struct JobPost {
    uint8 state;
    // if true, only workers in allowedWorkers can take or message
    // NOTE: couldn't this be determined by the whitelist being empty or not?
    bool whitelist_workers;
    bool arbitratorRequired;
    JobRoles roles;
    string title;
    string[] tags;
    uint40 content_cid_blob_idx; // 5 bytes
    bool multipleApplicants;
    uint256 amount; // wei
    address token;
    uint256 timestamp; // Timestamp of the latest update on the job (posted, started, closed)
    //NOTE: what used to be deadline is now maximum time to deliver the job and a snapshot of when the job was started. 
    //      TBD if that's the best approach
    uint32 maxTime; // 4 bytes
    uint32 jobStarted;
    string deliveryMethod;
    mapping(address => bytes) workerSignatures;
    mapping(address => uint256) collateralOwed; // Maps token addresses to amounts owed
    uint256 escrowId;
}

uint8 constant JOB_UPDATE_TITLE = 1; // update title
uint8 constant JOB_UPDATE_CONTENT = 2; // update content
uint8 constant JOB_UPDATE_OFFER = 3; // update token/deadline/amount
uint8 constant JOB_UPDATE_ADD_WORKER = 4; // add whitelist worker
uint8 constant JOB_UPDATE_REMOVE_WORKER = 5; // remove whitelist worker
uint8 constant JOB_UPDATE_ENABLE_WHITELIST = 6; // enable whitelist
uint8 constant JOB_UPDATE_DISABLE_WHITELIST = 7; // disable whitelist
uint8 constant JOB_UPDATE_CLOSE = 8; // close job
uint8 constant JOB_UPDATE_TAKEN = 9; // job taken by worker
uint8 constant JOB_UPDATE_OPEN = 10; // job reopened
uint8 constant JOB_UPDATE_DELIVERED = 11; // result delivered by the worker
uint8 constant JOB_UPDATE_RESULT_ACCEPTED = 12; // result accepted by the buyer
uint8 constant JOB_UPDATE_DISPUTE = 13; // dispute raised
uint8 constant JOB_UPDATE_ARBITRATION = 14; // dispute settled by arbitrator
uint8 constant JOB_UPDATE_ARBITRATOR_REFUSED = 15; // arbitrator refused the job

struct JobUpdate {
    uint8 t; // 1 byte / type of object
    uint40 blob_idx; // 5 bytes (used for title or content)
    address user; // 20 bytes (used for whitelist worker)
}

// We spoke about potentially linking each discussion thread to a job field. In such a case, 
// we should probably add a flag for that here
uint8 constant JOB_THREAD_WORKER_MESSAGE = 1;
uint8 constant JOB_THREAD_OWNER_MESSAGE = 2;
struct JobThreadObject {
    uint8 t; // 1 byte / type of object
    uint40 blob_idx; // 5 bytes
}

uint8 constant NOTIFICATION_WHITELISTED_FOR_JOB = 1;
uint8 constant NOTIFICATION_REMOVE_WHITELISTED_FOR_JOB = 2;
uint8 constant NOTIFICATION_CREATE_JOB = 3;
uint8 constant NOTIFICATION_JOB_TAKEN = 4;
uint8 constant NOTIFICATION_JOB_PAID = 5;
uint8 constant NOTIFICATION_JOB_UPDATED = 6;
uint8 constant NOTIFICATION_JOB_SIGNED = 7;

struct Notification {
    uint8 t; // 1 byte / type of object
    uint40 jobid; // job index
    uint40 threadid; // thread index
    address from; // who sent it
}

struct JobArbitrator {
    bytes publicKey;
    string name;
    uint16 fee;
}

/// @dev Stores current average user's rating and number of reviews so it can be updated with every new review
struct UserRating {
    /// @dev Current rating multiplied by 10,000 to achieve sufficient granularity even with lots of existing reviews
    uint16 averageRating;
    uint256 numberOfReviews;
}

contract MarketplaceV1 is OwnableUpgradeable, PausableUpgradeable {
    address public treasury; // where treasury fees/rewards go

    address public pauser; // who can pause contract

    uint256 public version; // version (should be updated when performing updates)

    // objects can reference blobs via index to here
    bytes[] public blobs;

    // user and bots receive notifications
    mapping(address => Notification[]) public notifications;

    // users must register by signing a message
    // this allows others to guarantee they can message securely
    // NOTE: perhaps we could allow users to add their (pseudo) identity too? 
    mapping(address => bytes) public publicKeys;

    mapping(address => JobArbitrator) public arbitrators;

    JobPost[] public jobs;

    mapping(string => string) private meceTags;

    mapping(uint256 => JobPost[]) public jobHistory;

    // tag -> jobid
    mapping(uint256 => uint256[]) public taggedJobs;

    // jobid -> address -> bool
    mapping(uint256 => mapping(address => bool)) public whitelistWorkers;
    // jobid -> JobUpdates
    mapping(uint256 => JobUpdate[]) public jobUpdates;

    mapping(uint256 => JobThreadObject[]) public threads;

    // Current average rating and number of ratings for each user 
    mapping(address => UserRating) public userRatings;

    uint256[48] __gap; // upgradeable gap

    address unicrowAddress = address(100);
    address unicrowDisputeAddress = address(100);
    address unicrowArbitratorAddress = address(100);

    address marketplaceAddress = address(100);
    uint16 marketplaceFee = 2000;

    uint8 ratingMin = 1;
    uint8 ratingMax = 5;


    /// @notice Modifier to restrict to only pauser
    modifier onlyPauser() {
        require(msg.sender == pauser, "not pauser");
        _;
    }

    modifier onlyJobCreator(uint256 job_id_) {
        require(jobs[job_id_].roles.creator == msg.sender, "not creator");
        _;
    }

    modifier onlyWorker(uint256 job_id_) {
        require(jobs[job_id_].roles.worker == msg.sender, "not worker");
        _;
    }

    modifier onlyCreatorOrWorker(uint256 job_id_) {
        require(jobs[job_id_].roles.creator == msg.sender || jobs[job_id_].roles.worker == msg.sender, "not worker or creator");
        _;
    }

    modifier onlyArbitrator(uint256 job_id_) {
        require(jobs[job_id_].roles.arbitrator == msg.sender, "not arbitrator");
        _;
    }

    // Governance function to add or update MECE tags
    //TODO: not sure if this should be onlyOwner or we should have a separate governance role and modifier
    function updateMeceTag(string memory shortForm, string memory longForm) public onlyOwner {
        require(bytes(shortForm).length > 0 && bytes(longForm).length > 0, "Invalid tag data");
        meceTags[shortForm] = longForm;
    }

    function removeMeceTag(string memory shortForm) public onlyOwner {
        require(bytes(meceTags[shortForm]).length != 0, "MECE tag does not exist");
        delete meceTags[shortForm];
    }
    
    function setMarketplaceAddress(address marketplaceAddress) public onlyOwner {
        marketplaceAddress = marketplaceAddress;
    }

    //TODO: add marketplace fee governance
    
    event PauserTransferred(
        address indexed previousPauser,
        address indexed newPauser
    );
    event TreasuryTransferred(
        address indexed previousTreasury,
        address indexed newTreasury
    );
    event VersionChanged(uint256 indexed version);

    event NotificationBroadcast(address indexed addr, uint256 indexed id);

    //TODO: double check if this is always sufficient (might be if other details are emitted in the respective functions that caused the update)
    event JobUpdated(uint256 indexed jobid);

    event PublicKeyRegistered(address indexed addr, bytes pubkey);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor(address unicrow_address_, address unicrow_dispute_address_, address unicrow_arbitrator_address_) {
        _disableInitializers();

        meceTags["DA"] = "DIGITAL_AUDIO";
        meceTags["DV"] = "DIGIAL_VIDEO";
        meceTags["DT"] = "DIGITAL_TEXT";
        meceTags["DS"] = "DIGITAL_SOFTWARE";
        meceTags["DO"] = "DIGITAL_OTHERS";
        meceTags["DG"] = "NON_DIGITAL_GOODS";
        meceTags["DS"] = "NON_DIGITAL_SERVICES";
        meceTags["DO"] = "NON_DIGITAL_OTHERS";

        unicrowAddress = unicrow_address_;
        unicrowDisputeAddress = unicrow_dispute_address_;
        unicrowArbitratorAddress = unicrow_arbitrator_address_;
    }

    /// @notice Initialize contract
    /// @dev For upgradeable contracts this function necessary
    /// @param treasury_ Address of treasury
    function initialize(address treasury_) public initializer {
        __Ownable_init(msg.sender);
        __Pausable_init();
        pauser = msg.sender;
        treasury = treasury_;
    }

    /// @notice Transfer ownership
    /// @param to_ Address to transfer ownership to
    function transferOwnership(
        address to_
    ) public override(OwnableUpgradeable) onlyOwner {
        super.transferOwnership(to_);
    }

    /// @notice Transfer pause ability
    /// @param to_ Address to transfer pauser to
    function transferPauser(address to_) external onlyOwner {
        emit PauserTransferred(pauser, to_);
        pauser = to_;
    }

    /// @notice Transfer treasury
    /// @param to_ Address to transfer treasury to
    function transferTreasury(address to_) external onlyOwner {
        emit TreasuryTransferred(treasury, to_);
        treasury = to_;
    }

    /// @notice Pauses contract
    function pause() external onlyPauser {
        _pause();
    }

    /// @notice Unpauses contract
    function unpause() external onlyPauser {
        _unpause();
    }

    /// @notice Set version
    /// @param version_ Version of contract
    /// @dev This is used for upgrades to inform miners of changes
    function setVersion(uint256 version_) external onlyOwner {
        version = version_;
        emit VersionChanged(version_);
    }

    function updateUnicrowAddresses(address unicrow_address_, address unicrow_dispute_address_, address unicrow_arbitrator_address_) public onlyOwner {
        unicrowAddress = unicrow_address_;
        unicrowDisputeAddress = unicrow_dispute_address_;
        unicrowArbitratorAddress = unicrow_arbitrator_address_;
    }

    /// @notice Get IPFS cid
    /// @dev use this for testing
    /// @param content_ Content to get IPFS cid of
    /// @return
    function generateIPFSCID(
        bytes calldata content_
    ) external pure returns (bytes memory) {
        return getIPFSCID(content_);
    }

    /// @notice Get block number (on both arbitrum and l1)
    /// @return Block number
    function getBlockNumberNow() internal view returns (uint256) {
        uint256 id;
        assembly {
            id := chainid()
        }

        if (
            id == ARBITRUM_NOVA_CHAINID ||
            id == ARBITRUM_GOERLI_CHAINID ||
            id == ARBITRUM_SEPOLIA_CHAINID
        ) {
            return ArbSys(ARBSYS_ADDRESS).arbBlockNumber();
        }

        return block.number;
    }

    function blobsLength() public view returns (uint256) {
        return blobs.length;
    }

    function jobUpdatesLength(uint256 job_id_) public view returns (uint256) {
        return jobUpdates[job_id_].length;
    }

    function getThreadKey(
        uint256 job_id_,
        address bot_
    ) public pure returns (uint256) {
        return (uint256(uint160(bot_)) << (256-170)) | job_id_;
    }

    function threadLength(
        uint256 job_id_,
        address bot_
    ) public view returns (uint256) {
        return threads[getThreadKey(job_id_, bot_)].length;
    }


    function notificationsLength(address addr_) public view returns (uint256) {
        return notifications[addr_].length;
    }

    // Function to get notifications starting from a specific index
    function getNotifications(address user_, uint index_) public view returns (Notification[] memory) {
        require(index_ < notifications[user_].length, "Index out of bounds");

        uint length = notifications[user_].length - index_;
        Notification[] memory notificationsToReturn = new Notification[](length);
        for (uint i = 0; i < length; i++) {
            notificationsToReturn[i] = notifications[user_][i + index_];
        }
        
        return notificationsToReturn;
    }
    

    // allow users to register their public key
    // this is used to allow others to message you securely
    // we do not do verification here because we want to allow contracts to register
    function registerPublicKey(bytes calldata pubkey) public {
        // we can allow users to update their public key
        // require(publicKeys[msg.sender].length == 0, "already registered");
        publicKeys[msg.sender] = pubkey;
        emit PublicKeyRegistered(msg.sender, pubkey);
    }

    function registerArbitrator(bytes calldata pubkey, string calldata name, uint16 fee) public {
        arbitrators[msg.sender] = JobArbitrator(
            pubkey,
            name,
            fee
        );
    }

    // called every time a job is updated in any way to log the update in the job's history
    function publishJobUpdate(
        uint256 job_id_,
        uint8 t_,
        uint40 blob_idx_,
        address user_
    ) internal {
        jobUpdates[job_id_].push(
            JobUpdate({t: t_, blob_idx: blob_idx_, user: user_})
        );
        emit JobUpdated(job_id_);
    }

    function publishNotification(
        address addr_,
        uint8 t_,
        uint40 job_id_,
        uint40 thread_id_
    ) internal {
        notifications[addr_].push(
            Notification({
                t: t_,
                jobid: job_id_,
                threadid: thread_id_,
                from: msg.sender
            })
        );
        emit NotificationBroadcast(addr_, notifications[addr_].length - 1);
    }

    // Function to read MECE tag's long form given the short form
    function readMeceTag(string memory shortForm) public view returns (string memory) {
        require(bytes(meceTags[shortForm]).length != 0, "Invalid MECE tag");
        return meceTags[shortForm];
    }

    //TODO: handle worker whitelists 
    //TODO: potentially add review filter sperate from whitelists
    /**
     * @notice Publish a new job post
     * @notice To assign the job to a specific worker, set multiple_applicants_ to false and add the worker to the allowed_workers_. In such a case, title and description can be encrypted for the worker
     * @notice The function will request a collateral deposit in the amount_ and token_ from the caller.
     * @param title_ job title - must be not null
     * @param content_ short job description
     * @param multiple_applicants_ do you want to select from multiple applicants or let the first one take the job?
     * @param tags_ labels to help the workers search for the job. Each job must have exactly one of the labels listed above, and any number of other labels
     * @param token_ token in which you prefer to pay the job with - must be a valid ERC20 token or 0x00..00 for ETH
     * @param amount_ expected amount to pay for the job - must be greater than 0
     * @param max_time_ maximum expected time (in sec) to deliver the job - must be greater than 0
     * @param delivery_method_ preferred method of delivery (e.g. "IPFS", "Courier")
     * @param arbitrator_required_ whether it is required to use an arbitrator to settle a dispute about the job
     * @param arbitrator_ address of an arbitrator preferred by the customer
     * @param allowed_workers_ list of workers that can apply for the job. Leave empty if any worker can apply
     */
    function publishJobPost(
        string calldata title_,
        bytes calldata content_,
        bool multiple_applicants_,
        string[] calldata tags_,
        address token_,
        uint256 amount_,
        uint256 max_time_,
        string calldata delivery_method_,
        bool arbitrator_required_,
        address arbitrator_,
        address[] calldata allowed_workers_
    ) public returns (uint256) {
        require(publicKeys[msg.sender].length > 0, "not registered");
        require(tags_.length > 0, "At least one tag is required");

        uint meceCount = 0;
        string memory meceShortForm = "";

        // Check for exactly one MECE tag
        for (uint8 i = 0; i < tags_.length; i++) {
            if (bytes(meceTags[tags_[i]]).length != 0) {
                meceCount++;
                if (meceCount > 1) {
                    revert("Only one MECE tag is allowed");
                }
                meceShortForm = tags_[i]; // Save the short form
            }
        }

        require(meceCount == 1, "Exactly one MECE tag is required");

        if (arbitrator_ != address(0)) {
            //QUESTION: is this the best way to check whether the arbitrtor has been registered?
            require(arbitrators[arbitrator_].publicKey.length > 0, "Arbitrator not registered");
        }

        SafeERC20.safeTransferFrom(IERC20(token_), msg.sender, address(this), amount_);

        jobs.push();

        uint256 jobid = jobs.length - 1;

        JobPost storage jobPost = jobs[jobid];

        jobPost.state = 0;
        jobPost.whitelist_workers = allowed_workers_.length > 0;
        jobPost.roles.creator = msg.sender;
        jobPost.title = title_;
        jobPost.tags = tags_;
        jobPost.content_cid_blob_idx = 0;
        jobPost.multipleApplicants = multiple_applicants_;
        jobPost.token = token_;
        jobPost.amount = amount_;
        jobPost.timestamp = block.timestamp;
        jobPost.maxTime = uint32(max_time_);
        jobPost.deliveryMethod = delivery_method_;
        jobPost.arbitratorRequired = arbitrator_required_;
        jobPost.roles.arbitrator = arbitrator_;
        jobPost.roles.worker = address(0);
        

        //NOTE: aren't we abusing the storage here a bit?
        // for (uint256 i = 0; i < tags_.length; i++) {
        //     taggedJobs[tags_[i]].push(jobid);
        // }

        if (allowed_workers_.length > 0) {
            updateJobWhitelist(jobid, allowed_workers_, new address[](0));
        }

        publishNotification(
            msg.sender,
            NOTIFICATION_CREATE_JOB,
            uint40(jobid),
            0
        );

        return jobid;
    }

    //TODO: update to reflect the job structure defined in publishJobPost()
    //TODO: if token or amount changes, collateral needs to be updated (deposit requested from or partial refund given to the buyer)
    //QUESTION: to minimize data manipulation and gas costs, should we make it so that if a parameter has empty value (e.g. "" in title or 0 for max_time_) than we wouldn't overwrite the data? 
    function updateJobPost(
        uint256 job_id_,
        bool whitelist_workers_,
        string calldata title_,
        bytes calldata content_,
        address token_,
        uint256 amount_,
        address arbitrator_,
        uint256 maxTime_
    ) public onlyJobCreator(job_id_) {
        require(jobs[job_id_].state == JOB_STATE_OPEN, "not open");

        // store old job
        // TODO: again, consider storage here. Commenting for now
        // jobHistory[job_id_].push(jobs[job_id_]);

        JobPost storage job = jobs[job_id_];

        if (job.token != token_ || job.amount != amount_) {
            if (job.state != JOB_STATE_CLOSED) {
                if (job.token == token_ && job.amount != amount_) {
                    if (amount_ > job.amount) {
                        uint256 difference = amount_ - job.amount;

                        if (job.collateralOwed[token_] > 0) {
                            if (job.collateralOwed[token_] >= difference) {
                                job.collateralOwed[token_] -= difference;
                            } else {
                                difference -= job.collateralOwed[token_];
                                SafeERC20.safeTransferFrom(IERC20(token_), msg.sender, address(this), difference);
                                delete job.collateralOwed[token_];
                            }
                        } else {
                            SafeERC20.safeTransferFrom(IERC20(token_), msg.sender, address(this), difference);
                        }
                    } else {
                        uint256 difference = job.amount - amount_;
                        if (block.timestamp >= job.timestamp + _24_HRS) {
                            SafeERC20.safeTransferFrom(IERC20(token_), address(this), msg.sender, difference);
                        } else {
                            job.collateralOwed[token_] += difference; // Record to owe later
                        }
                    }
                } else {
                    if (block.timestamp >= job.timestamp + _24_HRS) {
                        SafeERC20.safeTransferFrom(IERC20(token_), address(this), msg.sender, job.collateralOwed[job.token]);
                    } else {
                        job.collateralOwed[job.token] += job.amount; // Record to owe later
                    }
                    
                    SafeERC20.safeTransferFrom(IERC20(token_), msg.sender, address(this), amount_);
                }
            }
            
            job.token = token_;
            job.amount = amount_;
        }

        {
            jobs[job_id_].title = title_;
        }
        {
            bytes memory cid = getIPFSCID(content_);
            blobs.push(cid);
            jobs[job_id_].content_cid_blob_idx = uint40(blobs.length - 1);
        }
        {
            jobs[job_id_].whitelist_workers = whitelist_workers_;
            jobs[job_id_].maxTime = uint32(maxTime_);
        }

        {
            if (arbitrator_ != address(0)) {
                require(arbitrators[arbitrator_].publicKey.length > 0, "Arbitrator not registered");
            }
            jobs[job_id_].roles.arbitrator = arbitrator_;
        }

        if (jobs[job_id_].roles.worker != address(0)) {
            publishNotification(
                jobs[job_id_].roles.worker,
                NOTIFICATION_JOB_UPDATED,
                uint40(job_id_),
                0
            );
        }

        emit JobUpdated(job_id_);
    }

    //TODO: reflect possibility of external whitelist
    function updateJobWhitelist(
        uint256 job_id_,
        address[] calldata allowed_workers_,
        address[] memory disallowed_workers_
    ) public onlyJobCreator(job_id_) {
        require(jobs[job_id_].state == JOB_STATE_OPEN, "not open");

        for (uint256 i = 0; i < allowed_workers_.length; i++) {
            whitelistWorkers[job_id_][allowed_workers_[i]] = true;
            publishNotification(
                allowed_workers_[i],
                NOTIFICATION_WHITELISTED_FOR_JOB,
                uint40(job_id_),
                0
            );
        }

        for (uint256 i = 0; i < disallowed_workers_.length; i++) {
            whitelistWorkers[job_id_][disallowed_workers_[i]] = false;
            publishNotification(
                disallowed_workers_[i],
                NOTIFICATION_REMOVE_WHITELISTED_FOR_JOB,
                uint40(job_id_),
                0
            );
        }
    }

    /**
     * @notice Close the job that hasn't been started. 
     * @notice If it's been more than 24 hrs since the job was posted, the collateral will be automatically returned.
     * @notice Otherwise the buyer must withdraw the collateral separately.
     */
    function closeJob(uint256 job_id_) public onlyJobCreator(job_id_) {
        require(jobs[job_id_].state == JOB_STATE_OPEN, "not open");
        JobPost storage job = jobs[job_id_];
        job.state = JOB_STATE_CLOSED;

        if (block.timestamp >= job.timestamp + _24_HRS) {
            uint256 amount = job.amount + job.collateralOwed[job.token];
            delete job.collateralOwed[job.token]; // Clear the collateral record
            SafeERC20.safeTransferFrom(IERC20(job.token), address(this), job.roles.creator, amount);
        } else {
            job.collateralOwed[job.token] += job.amount;
        }

        publishJobUpdate(job_id_, JOB_UPDATE_CLOSE, 0, address(0));
        emit JobUpdated(job_id_);
    }

    /**
     * @notice Withdraw collateral from the closed job 
     */
    function withdrawCollateral(uint256 jobId, address token_) public {
        JobPost storage job = jobs[jobId];
        require(block.timestamp >= job.timestamp + _24_HRS, "24 hours have not passed yet");
        require(job.collateralOwed[token_] > 0, "No collateral to withdraw for this token");

        uint256 amount = job.collateralOwed[token_];
        delete job.collateralOwed[token_]; // Reset the owed amount
        SafeERC20.safeTransferFrom(IERC20(token_), address(this), job.roles.creator, amount);
    }

    function reopenJob(uint256 job_id_) public onlyJobCreator(job_id_) {
        JobPost storage job = jobs[job_id_];

        require(job.state == JOB_STATE_CLOSED, "not closed");

        if (job.collateralOwed[job.token] < job.amount) {
            SafeERC20.safeTransferFrom(IERC20(job.token), msg.sender, address(this), job.amount - job.collateralOwed[job.token]);
            delete job.collateralOwed[job.token];
        } else {
            job.collateralOwed[job.token] -= job.amount;
        }

        job.state = JOB_STATE_OPEN;
        job.timestamp = block.timestamp;
        publishJobUpdate(job_id_, JOB_UPDATE_OPEN, 0, address(0));
        emit JobUpdated(job_id_);
    }

    //TODO: update to reflect the agreement about threads being related to elements of the job structure
    function postThreadMessage(
        uint256 job_id_,
        bytes calldata content_
    ) public {
        if (jobs[job_id_].state == JOB_STATE_TAKEN) {
            // require(jobs[job_id_].worker == msg.sender, "taken/not worker");
        } else {
            require(jobs[job_id_].state == JOB_STATE_OPEN, "not open");
            require(
                jobs[job_id_].whitelist_workers == false ||
                    whitelistWorkers[job_id_][msg.sender],
                "not whitelisted"
            );
        }

        bool isOwner = jobs[job_id_].roles.creator == msg.sender;
        if (isOwner) {
            require(
                jobs[job_id_].whitelist_workers == false ||
                    whitelistWorkers[job_id_][msg.sender],
                "not whitelisted"
            );
        }

        bytes memory content_cid = getIPFSCID(content_);
        blobs.push(content_cid);
        uint40 content_cid_blob_idx = uint40(blobs.length - 1);

        uint256 threadid = getThreadKey(job_id_, msg.sender);

        if (isOwner) {
            threads[threadid].push(
                JobThreadObject({
                    t: JOB_THREAD_OWNER_MESSAGE,
                    blob_idx: content_cid_blob_idx
                })
            );
            publishNotification(
                jobs[job_id_].roles.worker,
                JOB_THREAD_OWNER_MESSAGE,
                uint40(job_id_),
                uint40(threads[threadid].length)
            );
        } else {
            threads[threadid].push(
                JobThreadObject({
                    t: JOB_THREAD_WORKER_MESSAGE,
                    blob_idx: content_cid_blob_idx
                })
            );
            publishNotification(
                jobs[job_id_].roles.creator,
                JOB_THREAD_WORKER_MESSAGE,
                uint40(job_id_),
                uint40(threads[threadid].length)
            );
        }
    }

    /**
     * @notice The worker takes the job, i.e. is ready to start working on it. 
     *         The worker also cryptographically signs job parameters to prevent disputes about job specification.
     *         If this is FCFS job, the function may move money to the 
     * @param job_id_ id of the job
     * @param signature_ worker's signature of all the job parameters
     */
    function takeJob(uint256 job_id_, bytes calldata signature_) public {
        //TODO: store worker's signature
        //TODO: move funds from collateral to escrow, incl. storing and perhaps returning escrow id
        require(publicKeys[msg.sender].length > 0, "not registered");

        JobPost storage job = jobs[job_id_];

        require(job.state == JOB_STATE_OPEN, "not open");
        require(
            job.whitelist_workers == false ||
                whitelistWorkers[job_id_][msg.sender],
            "not whitelisted"
        );

        signJob(job_id_, signature_);

        
        if (!job.multipleApplicants) {
            job.state = JOB_STATE_TAKEN;
            // job.worker = msg.sender;

            Unicrow unicrow = Unicrow(unicrowAddress);
            //TODO: Unicrow needs to be updated to allow custom "buyer" and that needs to be reflected here. 
            //      For now working without this option
            EscrowInput memory escrowInput = EscrowInput(
                msg.sender,
                marketplaceAddress,
                marketplaceFee,
                job.token,
                job.maxTime + _24_HRS,
                job.maxTime + _24_HRS,
                job.amount
            );

            //TODO: Currently, default (and the only) Unicrow's pay function simply sets msg.sender as the buyer and
            //      asks them to send the money. 
            //      We need a function that will
            //          - allow us to pay from this contract (from the collateral) rather than from the user's wallet 
            //          - will check whether a buyer was defined and if yes use it
            //      For now calling the function as is
            job.escrowId = unicrow.pay(escrowInput, job.roles.arbitrator, arbitrators[job.roles.arbitrator].fee);
            
            publishJobUpdate(job_id_, JOB_UPDATE_TAKEN, 0, address(0));
            publishNotification(
                job.roles.creator,
                NOTIFICATION_JOB_TAKEN,
                uint40(job_id_),
                0
            );
        }
    }

    //NOTE: there's no checking of the signature here yet. We could do it I guess, just need to figure out
    //      the IPFS integration but also how to concatanate the job parameters and thread to one message 
    //      (that needs to be done on the frontend anyway so it's just about making sure the method is unified)
    function signJob(uint256 job_id_, bytes calldata signature_) public {
        require(publicKeys[msg.sender].length > 0, "not registered");
        require(jobs[job_id_].state == JOB_STATE_OPEN, "not open");
        require(
            jobs[job_id_].whitelist_workers == false ||
                whitelistWorkers[job_id_][msg.sender],
            "not whitelisted"
        );

        // potentially multiple applicants could sign the job so we need to be able to store all of them
        jobs[job_id_].workerSignatures[msg.sender] = signature_;

        publishNotification(
            jobs[job_id_].roles.creator,
            NOTIFICATION_JOB_SIGNED,
            uint40(job_id_),
            0
        );
    }

    //TBD: Do we want to provide a function to calculate an amount required for the payStartJob here or do we simply calculate it in the frontend?
    //TODO: add a check that the worker has been registered
    /**
     * @notice Pay for a job so that the it gets started.
     * @notice The token and the amount can be different to what was set in the job posting if the 
     * @notice  customer and the worker agreed on it. 
     * @notice  The function handles the difference - if the required amount is higher, 
     * @notice  it will ask the user to pay the difference. 
     * @notice  If the final amount is lower than what was paid in the collateral, it will refund it or 
     * @param job_id_ ID of the job
     * @param worker_ An address of the worker selected for the job
     * @param token_ Which token should be used for the payment (0x00..00 for ETH)
     * @param amount_ The price for the job in the defined token. 
     */
    function payStartJob(uint256 job_id_, address worker_, address token_, uint amount_) public payable onlyJobCreator(job_id_) {
        JobPost storage job = jobs[job_id_];

        require(job.state == JOB_STATE_OPEN, "not open");

        //NOTE: we could  check that the worker has signed the job scope, but if the customer decides
        //      to assign and pay for the job anyway, that should perhaps be their perogative

        job.state = JOB_STATE_TAKEN;
        job.roles.worker = worker_;

        Unicrow unicrow = Unicrow(unicrowAddress);

        uint amountDifference = 0;
        uint amountToTopUp = 0;
        uint amountToReturn = 0;
        
        if (token_ == job.token) {
            if (amount_ > job.amount) {
                amountToTopUp = amount_ - job.amount;
            } else {
                amountToReturn = job.amount - amount_;
            }
        } else {
            amountToReturn = job.amount;
            amountToTopUp = amount_;
        }

        if (amountToTopUp > 0) {
            if (token_ != address(0)) {
                SafeERC20.safeTransferFrom(IERC20(token_), msg.sender, address(this), amountToTopUp);
            } else {
                require(msg.value != amountToTopUp, "Required amount doesn't match the amount sent");
            }
        }

        if (amountToReturn > 0) {
            if (block.timestamp > job.timestamp + _24_HRS) {
                if (job.token != address(0)) {
                    SafeERC20.safeTransferFrom(IERC20(job.token), address(this), msg.sender, amountToTopUp);
                } else {
                    (bool success, ) = msg.sender.call{value: amountToReturn}("");
                    require(success, "Transfer failed");
                }            
            } else {
                job.collateralOwed[job.token] += amountToReturn;
            }
        }

        //TODO: Replace with a function that receives the amount from this contract 
        EscrowInput memory escrowInput = EscrowInput(
            worker_,
            marketplaceAddress,
            marketplaceFee,
            token_,
            job.maxTime + _24_HRS,
            job.maxTime + _24_HRS,
            amount_
        );

        publishJobUpdate(job_id_, JOB_UPDATE_TAKEN, 0, address(0));
        publishNotification(
            worker_,
            NOTIFICATION_JOB_PAID,
            uint40(job_id_),
            0
        );
    }
    

    //NOTE: perhaps this is redundant and might be handled by a message with a specific type
    /** 
     * @notice Information about the job delivery
     * @param job_id_ Id of the job
     * @param result_ e.g. IPFS url or a tracking no.
    */
    function deliverResult(uint256 job_id_, bytes calldata result_) public onlyWorker(job_id_) {
        JobPost storage job = jobs[job_id_];

        //TODO: buyer should be notified. TBD if the result should be saved somewhere
    }


    /**
     * @notice Buyer approves the result delivered by the seller, releases funds from the escrow, and optionally leaves a review.
     * @param review_rating_ 1-5 (tbd) score of the worker. Set to 0 for no review
     * @param review_text_ Optional review text. Empty string for no text
     */
    function approveResult(uint256 job_id_, uint8 review_rating_, string calldata review_text_) public onlyJobCreator(job_id_) {
        JobPost storage job = jobs[job_id_];

        require(job.state == JOB_STATE_TAKEN, "job in invalid state");

        Unicrow unicrow = Unicrow(unicrowAddress);

        unicrow.release(job.escrowId);

        job.state = JOB_STATE_CLOSED;

        if (review_rating_ > 0) {
            review(job_id_, review_rating_, review_text_);
        }
    }

    function review(uint256 job_id_, uint8 review_rating_, string calldata review_text_) public onlyJobCreator(job_id_) {
        require(review_rating_ >= ratingMin && review_rating_ <= ratingMax, "Invalid review score");
        require(jobs[job_id_].state == JOB_STATE_CLOSED, "Job doesn't exist or not closed");
        
        UserRating storage rating = userRatings[jobs[job_id_].roles.worker];

        rating.averageRating = uint16((rating.averageRating * rating.numberOfReviews + review_rating_ * 10000) / (rating.numberOfReviews + 1));
        rating.numberOfReviews++;

        //TODO: decide if we really want to support also review text
    }

    /**
     * @notice Worker refunds the buyer and switches the job back to non-started state
     */
    function refund(uint256 job_id_) public onlyWorker(job_id_) {
        JobPost storage job = jobs[job_id_];

        Unicrow unicrow = Unicrow(unicrowAddress);

        unicrow.refund(job.escrowId);

        job.state = JOB_STATE_OPEN;

        // remove the worker from the whitelist
        updateJobWhitelist(job_id_, [], [job.roles.worker]);
    }

    /**
     * TODO: define the format of submission in such a way that the arbitrator will have complete information and can check worker's signature
     * @notice Raise a dispute with the arbitrator. 
     * @notice The content and delivery method should be provided because they might have been encrypted on-chain for the seller, 
     * @notice All the text fields should be encrypted for all three parties.
     * @notice If the buyer is calling the dispute, the function will challenge the payment on Unicrow.
     * @param content_ Short description exactly as in the job definition signed by the worker. Decrypted and encrypted again for the arbitrator.
     * @param deliveryMethod_ Decrypted from the job definition and encrypted for the arbitrator
     * @param chat_history_ Chat history encrypted for the arbitrator
     * @param chat_signature_ Signature matching the chat history
     * @param message_ reason for the dispute
     */
    function dispute(uint256 job_id_, string calldata content_, string calldata deliveryMethod_, string calldata chat_history_, bytes calldata chat_signature_, string calldata message_) public onlyCreatorOrWorker(job_id_) {
        JobPost storage job = jobs[job_id_];

        if (msg.sender == job.roles.creator) {
            UnicrowDispute unicrowDispute = UnicrowDispute(unicrowDisputeAddress);

            unicrowDispute.challenge(job.escrowId);
        }

        //TODO: add notification / message sending (after we settle on tech implementation of that)

        //TODO: start a group chat including at least the message
        //TBD: decide whether the job data and chat history should also be included in the message or provided some other way
        //TBD: result should be included too, TBD how (it might simply be part of the chat history, or a separate parameter)
    }

    /**
     * @notice decide on a dispute about the job.
     * @param buyer_share_ how much of the payment should be refunded back to the buyer (in BPS)
     * @param worker_share_ how much of the payment should be released to the worker (in BPS)
     * @param reason_ reason for arbitrator's decision (encrypted for all three parties)
     */
    function arbitrate(uint256 job_id_, uint16 buyer_share_, uint16 worker_share_, string calldata reason_) public onlyArbitrator(job_id_) {
        JobPost storage job = jobs[job_id_];

        UnicrowArbitrator unicrowArbitrator = UnicrowArbitrator(unicrowArbitratorAddress);

        // the arbitrate function checks that the shares equal 100%, otherwise throws an error
        unicrowArbitrator.arbitrate(job.escrowId, [buyer_share_, worker_share_]);

        //TODO: add notification / message sending (after we settle on tech implementation of that)
    }

    /**
     * @notice If an arbitrator has been included in a job they're not comfortable with, they can remove themselves. 
     * @notice If the job has been started and paid into the escrow, the escrow will be fully refunded
     * TBD: we discussed that the in this case, the arbitrator fee should be refunded as well so t hat the arbitrator doesn't keep 
     *      funds from potentially illicit transactions. However, perhaps it might be better for the arbitrator to keep the fee to prevent spam? 
     *      More in Notion
     */
    function refuseArbitration(uint256 job_id_) public onlyArbitrator(job_id_) {
        JobPost storage job = jobs[job_id_];

        //TODO: 
        // - remove arbitrator from the job
        // - if the job has been started:
        //     - change to not started
        //     - refud the escrow, incl. arbitrator fee (see TBD above)

    }
}