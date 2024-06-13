// SPDX-License-Identifier: MIT

pragma solidity ^0.8.7;

import "./@openzeppelin/contracts/utils/Context.sol";
import "./@openzeppelin/contracts/utils/Counters.sol";
import "./@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "./@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interfaces/IUnicrow.sol";
import "./interfaces/IUnicrowClaim.sol";
import "./interfaces/IUnicrowArbitrator.sol";
import "./UnicrowDispute.sol";
import "./UnicrowTypes.sol";

/// @title The primary Unicrow contract
/// @notice Receives and distributes the payments, maintains and provides information about the escrow records, and allows basic operations
contract Unicrow is ReentrancyGuard, IUnicrow, Context {
    using Counters for Counters.Counter;

    /// Generates unique escrow ID in incremental order
    Counters.Counter public escrowIdCounter;

    /// @notice Arbitrator information and functionality for the escrows
    IUnicrowArbitrator public immutable unicrowArbitrator;

    /// @notice Withdraws payments from the escrows once the criteria are met
    IUnicrowClaim public immutable unicrowClaim;

    /// @notice Dispute resolution, incl. challenges and settlements
    UnicrowDispute public immutable unicrowDispute;

    /// @notice Escrow fee in bips (can never be higher than 100)
    uint16 public protocolFee;

    /// address of a governance contract (multisig initially, DAO governor eventually)
    address public governanceAddress;

    /// storage of the primary escrow data. The key is generated by the contract incrementally
    mapping(uint256 => Escrow) escrows;

    /**
     * @notice Emitted when the payment is deposited into the contract and an escrow record is created
     * @param escrowId Unique, contract-generated escrow record identifier
     * @param blockTime timestamp of the block in which the transaction was included
     * @param escrow Details of the escrow as stored in the contract
     * @param arbitrator Address of an arbitrator (zero is returned if no arbitrator was defined)
     * @param arbitratorFee Arbitrator's fee in bips
     * @param challengePeriod Initial challenge period in seconds
     */
    event Pay(
        uint256 indexed escrowId,
        uint256 blockTime,
        Escrow escrow,
        address arbitrator,
        uint256 arbitratorFee,
        uint256 challengePeriod
    );

    /**
     * @notice Emitted when the buyer releases the payment manually (regardless of the challenge period)
     * @param escrowId ID of the released escrow payment
     * @param blockTime Timestamp of the block in which the transaction was included
     * @param escrow Details of the released Escrow
     * @param amounts Amounts in token allocated to each party (incl. fees). See UnicrowTypes for mapping of each party (WHO_*)
     */
    event Release(
        uint256 indexed escrowId,
        uint256 blockTime,
        Escrow escrow,
        uint256[5] amounts
    );

    /**
     * @notice Emitted when seller fully refunds the payment. Detailed calculated values are not returned because the payment is refunded in full, all fees are waived
     * @param escrowId Id of the refunded payment
     * @param escrow Details of the refunded payment
     * @param blockTime Timestamp of the block in which the transaction was included
     */
    event Refund(uint256 indexed escrowId, Escrow escrow, uint256 blockTime);

    /// The contructor initiates immutable and governed references to other contracts
    constructor(
        address unicrowClaim_,
        address unicrowArbitrator_,
        address unicrowDispute_,
        address governanceAddress_,
        uint16 protocolFee_
    ) {
        unicrowArbitrator = IUnicrowArbitrator(unicrowArbitrator_);
        unicrowClaim = IUnicrowClaim(unicrowClaim_);
        unicrowDispute = UnicrowDispute(unicrowDispute_);
        governanceAddress = governanceAddress_;
        protocolFee = protocolFee_;
    }

    /// Check that the governance contract is calling this
    modifier onlyGovernance() {
        require(_msgSender() == governanceAddress);
        _;
    }

    /// Check that Unicrow's claimMultiple contract is calling this
    modifier onlyUnicrowClaim() {
        require(_msgSender() == address(unicrowClaim));
        _;
    }

    /// Check that arbitration or dispute contract is calling this
    modifier onlyUnicrowArbitratorOrDispute() {
        require(
            _msgSender() == address(unicrowArbitrator) ||
                _msgSender() == address(unicrowDispute)
        );
        _;
    }

    /// Check that dispute contract is calling this
    modifier onlyUnicrowDispute() {
        require(_msgSender() == address(unicrowDispute));
        _;
    }

    /// @inheritdoc IUnicrow
    function pay(
        EscrowInput calldata input,
        address arbitrator,
        uint16 arbitratorFee
    ) external payable override nonReentrant {
        // Get current escrow id from the incremental counter
        uint256 escrowId = escrowIdCounter.current();

        // The address that sent the payment is set as a buyer
        address buyer = _msgSender();

        // Amount of the payment in ERC20 tokens
        uint amount = input.amount;

        // Make sure there's something left for the seller :-)
        require(
            arbitratorFee + input.marketplaceFee + protocolFee < 10000,
            "1-026"
        );

        // Payment can't use address(0)
        require(escrows[escrowId].buyer == address(0), "0-001");

        // Seller cannot be empty
        require(input.seller != address(0), "0-002");

        // Buyer cannot be seller
        require(buyer != input.seller, "0-003");

        // Payment amount must be greater than zero
        require(amount > 0, "0-011");

        // Buyer can't send ETH if currency is not ETH
        if (msg.value > 0) {
            require(input.currency == address(0), "0-010");
        }

        // Check if the payment was made in ETH
        if (input.currency == address(0)) {
            // Amount in the payment metadata must match what was sent
            require(amount == msg.value);
        } else {
            uint balanceBefore = IERC20(input.currency).balanceOf(
                address(this)
            );

            // If the payment was made in ERC20 and not ETH, execute the transfer
            SafeERC20.safeTransferFrom(
                IERC20(input.currency),
                buyer,
                address(this),
                amount
            );

            uint balanceAfter = IERC20(input.currency).balanceOf(address(this));

            // Make sure that the input amount is the amount received
            amount = balanceAfter - balanceBefore;
        }

        // If a marketplace fee was set, ensure a marketplace address was set
        if (input.marketplaceFee > 0) {
            require(input.marketplace != address(0), "0-009");
        }

        // Check if the arbitrator was defined
        if (arbitrator != address(0)) {
            // Arbitrator can't be seller or buyer
            require(arbitrator != buyer && arbitrator != input.seller, "1-027");

            // Set the arbitrator in the arbitrator contract
            unicrowArbitrator.setArbitrator(
                escrowId,
                arbitrator,
                arbitratorFee
            );
        }

        // Split array is how Unicrow maintains information about seller's and buyer's shares, and the fees
        uint16[4] memory split = [0, 10000, input.marketplaceFee, protocolFee];

        // Set initial consensus to buyer = 0, seller = 1
        int16[2] memory consensus = [int16(0), int16(1)];

        // Create an Escrow object that will be stored in the contract
        Escrow memory escrow = Escrow({
            buyer: buyer,
            seller: input.seller,
            currency: input.currency,
            marketplace: input.marketplace,
            marketplaceFee: input.marketplaceFee,
            claimed: 0,
            split: split,
            consensus: consensus,
            challengeExtension: uint64(
                input.challengeExtension > 0
                    ? input.challengeExtension
                    : input.challengePeriod
            ),
            challengePeriodStart: uint64(block.timestamp), //challenge start
            challengePeriodEnd: uint64(block.timestamp + input.challengePeriod), //chalenge end
            amount: amount
        });

        // Store the escrow information
        escrows[escrowId] = escrow;

        // Increase the escrow id counter
        escrowIdCounter.increment();

        emit Pay(
            escrowId,
            block.timestamp,
            escrow,
            arbitrator,
            arbitratorFee,
            input.challengePeriod
        );
    }

    /// @inheritdoc IUnicrow
    function refund(uint256 escrowId) external override nonReentrant {
        address sender = _msgSender();

        // Get escrow information from the contract's storage
        Escrow memory escrow = escrows[escrowId];

        // Only seller can refund
        require(sender == escrow.seller, "1-011");

        // Check that the escrow is not claimed yet
        require(escrow.claimed == 0, "0-005");

        // Set split to 100% to buyer and waive the fees
        escrow.split[WHO_BUYER] = 10000;
        escrow.split[WHO_SELLER] = 0;
        escrow.split[WHO_MARKETPLACE] = 0;
        escrow.split[WHO_PROTOCOL] = 0;

        // Keep record of number of challenges (for reputation purposes)
        escrow.consensus[WHO_BUYER] = abs8(escrow.consensus[WHO_BUYER]) + 1;

        // Set escrow consensus based on the number of previous challenges (1 = no challenge)
        escrow.consensus[WHO_SELLER] = abs8(escrow.consensus[WHO_SELLER]);

        // Update splits and consensus information in the storage
        escrows[escrowId].split = escrow.split;
        escrows[escrowId].consensus = escrow.consensus;

        // Update the escrow as claimed in the storage and in the emitted event
        escrows[escrowId].claimed = 1;
        escrow.claimed = 1;

        // Withdraw the amount to the buyer
        if (address(escrow.currency) == address(0)) {
            (bool success, ) = escrow.buyer.call{value: escrow.amount}("");
            require(success, "1-012");
        } else {
            SafeERC20.safeTransfer(
                IERC20(escrow.currency),
                escrow.buyer,
                escrow.amount
            );
        }

        emit Refund(escrowId, escrow, block.timestamp);
    }

    /// @inheritdoc IUnicrow
    function release(uint256 escrowId) external override {
        address sender = _msgSender();
        Escrow memory escrow = escrows[escrowId];

        // Only buyer can release
        require(sender == escrow.buyer, "1-025");

        // Set buyer consensus to 1 or based on the number of previous challenges
        escrow.consensus[WHO_BUYER] = abs8(escrow.consensus[WHO_BUYER]) + 1;

        // Set seller's escrow consensus based on the number of previous challenges
        escrow.consensus[WHO_SELLER] = abs8(escrow.consensus[WHO_SELLER]);

        // Update consensus in the storage
        escrows[escrowId].consensus = escrow.consensus;

        // Claim the payment and fees and get the final amounts
        uint256[5] memory amounts = unicrowClaim.claim(escrowId);

        // Emit all the information including the amounts
        emit Release(escrowId, block.timestamp, escrow, amounts);
    }

    /// @inheritdoc IUnicrow
    function challenge(
        uint256 escrowId,
        uint16[4] calldata split,
        int16[2] calldata consensus,
        uint64 challengeStart,
        uint64 challengeEnd
    ) external override onlyUnicrowDispute {
        escrows[escrowId].split = split;
        escrows[escrowId].consensus = consensus;
        escrows[escrowId].challengePeriodStart = challengeStart;
        escrows[escrowId].challengePeriodEnd = challengeEnd;
    }

    /// @inheritdoc IUnicrow
    function updateEscrowFee(uint16 fee) external override onlyGovernance {
        require(fee <= 100, "0-008");
        protocolFee = fee;
    }

    /// @inheritdoc IUnicrow
    function updateGovernance(
        address governance
    ) external override onlyGovernance {
        governanceAddress = governance;
    }

    /// @notice Return basic escrow information (excl. arbitration information, settlement offers, and token details)
    /// @param escrowId ID of the escrow to be returned
    function getEscrow(
        uint256 escrowId
    ) external view override returns (Escrow memory) {
        return escrows[escrowId];
    }

    /// @notice Return all the escrow data (incl. arbitration information, settlement offers, and token details)
    /// @param escrowId ID of the escrow to be returned
    function getAllEscrowData(
        uint256 escrowId
    ) external view returns (Data memory) {
        address currency = escrows[escrowId].currency;

        // Get information about the ERC20 token (or return ETH)
        Token memory token = Token({
            address_: currency,
            decimals: currency == address(0) ? 18 : ERC20(currency).decimals(),
            symbol: currency == address(0) ? "ETH" : ERC20(currency).symbol()
        });

        Arbitrator memory arbitrator = unicrowArbitrator.getArbitratorData(
            escrowId
        );
        Settlement memory settlement = unicrowDispute.getSettlementDetails(
            escrowId
        );

        return Data(escrows[escrowId], arbitrator, settlement, token);
    }

    /// @dev Transfer ether or token from this contract's treasury. Can be called only by Unicrow's Claim contract
    function sendEscrowShare(
        address to,
        uint256 amount,
        address currency
    ) public onlyUnicrowClaim {
        if (currency == address(0)) {
            to.call{value: amount, gas: 5000}("");
        } else {
            SafeERC20.safeTransfer(IERC20(currency), to, amount);
        }
    }

    /// @inheritdoc IUnicrow
    function settle(
        uint256 escrowId,
        uint16[4] calldata split,
        int16[2] calldata consensus
    ) external override onlyUnicrowArbitratorOrDispute {
        escrows[escrowId].split = split;
        escrows[escrowId].consensus = consensus;
    }

    /// @inheritdoc IUnicrow
    function splitCalculation(
        uint16[5] calldata currentSplit
    ) external pure override returns (uint16[5] memory) {
        uint16[5] memory split;

        uint16 calculatedArbitratorFee;

        // Discount the protocol fee based on seller's share
        if (currentSplit[WHO_PROTOCOL] > 0) {
            split[WHO_PROTOCOL] = uint16(
                (uint256(currentSplit[WHO_PROTOCOL]) *
                    currentSplit[WHO_SELLER]) / _100_PCT_IN_BIPS
            );
        }

        // Discount the marketplace fee based on the seller's share
        if (currentSplit[WHO_MARKETPLACE] > 0) {
            split[WHO_MARKETPLACE] = uint16(
                (uint256(currentSplit[WHO_MARKETPLACE]) *
                    currentSplit[WHO_SELLER]) / _100_PCT_IN_BIPS
            );
        }

        // Calculate the arbitrator fee based on the seller's split
        if (currentSplit[WHO_ARBITRATOR] > 0) {
            calculatedArbitratorFee = uint16(
                (uint256(currentSplit[WHO_ARBITRATOR]) *
                    currentSplit[WHO_SELLER]) / _100_PCT_IN_BIPS
            );
        }

        // Calculate seller's final share by substracting all the fees
        split[WHO_SELLER] =
            currentSplit[WHO_SELLER] -
            split[WHO_PROTOCOL] -
            split[WHO_MARKETPLACE] -
            calculatedArbitratorFee;
        split[WHO_BUYER] = currentSplit[WHO_BUYER];
        split[WHO_ARBITRATOR] = calculatedArbitratorFee;

        return split;
    }

    /// @inheritdoc IUnicrow
    function setClaimed(
        uint256 escrowId
    ) external override onlyUnicrowClaim nonReentrant {
        escrows[escrowId].claimed = 1;
    }
}
