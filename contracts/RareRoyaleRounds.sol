// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * Rare Royale rounds: the production path for the RF that the preview simulates.
 *
 * REFERENCE CONTRACT. Tested on an in-process EVM (tests/contract.test.mjs), but not deployed and not audited.
 * The playable preview never calls it; every RF in the game stays simulated. It shows exactly where each RF would go
 * with real $RAREFRIENDS, using the same numbers as games/rare-royale/engine/economy.ts:
 *
 *   entry 1 RF      held until settlement: 0.6 ladder + 0.2 bounties go back to entrants, 0.1 burned, 0.1 to rewards;
 *                   a round with fewer than 5 paid entries refunds every entry in full
 *   gameplay        shield, medkit, second life (2, 4, 8 RF), Locker cosmetics, shouts:
 *                   50% burned with the RF token's burn() at once, 50% to active Friend rewards
 *   settlement      the ladder and the bounties are credited to entrants (pull payments), and bounties lost to the
 *                   storm or to wild Friends are burned
 *
 * Trust model: the battle is deterministic. Its seed is fixed on chain only after entries close (so nobody can
 * simulate a round before entering), and every sponsor payment is an event with a block timestamp, so anyone can
 * re-run the open-source engine and check the operator's settlement. A production version would add a dispute
 * window or a verifiable-randomness seed; the reward-funding address is the Rare Friends team's to provide.
 */

interface IRareFriendsToken {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function burn(uint256 amount) external;
}

interface IGenerations {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract RareRoyaleRounds {
    uint256 public constant ENTRY = 1e18;
    uint256 public constant ENTRY_BURN = 0.1e18;
    uint256 public constant ENTRY_REWARDS = 0.1e18;
    uint256 public constant ROUND_SIZE = 50;
    uint256 public constant MIN_PAID = 5;
    uint256 public constant ROUND_SECONDS = 300;
    uint256 public constant LOBBY_SECONDS = 60;
    uint256 public constant MAX_REVIVES = 3;

    enum Item { Shield, Medkit, Revive }

    struct Round {
        uint32 paid;
        bool locked;
        bool sponsorClosed;
        bool settled;
        bool refunded;
        uint256 seed;
    }

    IRareFriendsToken public immutable rf;
    IGenerations public immutable generations;
    address public immutable rewards;
    uint256 public immutable epoch;
    address public operator;

    mapping(uint256 => Round) public rounds;
    /** round => Friend => the wallet that entered it */
    mapping(uint256 => mapping(uint256 => address)) public entrant;
    /** round => Friend => second lives bought for it */
    mapping(uint256 => mapping(uint256 => uint256)) public revives;
    mapping(address => uint256) public claimable;
    uint256 public totalBurned;
    uint256 private unlocked = 1;

    event Entered(uint256 indexed round, uint256 indexed friend, address indexed wallet);
    event Sponsored(uint256 indexed round, uint256 indexed friend, address indexed by, Item item, uint256 price);
    event GameplayPaid(address indexed by, bytes32 indexed kind, uint256 amount);
    event SponsoringClosed(uint256 indexed round);
    event Locked(uint256 indexed round, uint256 seed);
    event Settled(uint256 indexed round, uint256 paidOut, uint256 bountiesBurned);
    event Refunded(uint256 indexed round);
    event Burned(uint256 amount);

    modifier nonReentrant() {
        require(unlocked == 1, "reentrant");
        unlocked = 2;
        _;
        unlocked = 1;
    }

    constructor(IRareFriendsToken rf_, IGenerations generations_, address rewards_, uint256 epoch_, address operator_) {
        rf = rf_;
        generations = generations_;
        rewards = rewards_;
        epoch = epoch_;
        operator = operator_;
    }

    function startOf(uint256 round) public view returns (uint256) {
        return epoch + round * ROUND_SECONDS;
    }

    /** Enter your own Friend for 1 RF during the round's lobby. The entry is held until settlement. */
    function enter(uint256 round, uint256 friend) external nonReentrant {
        uint256 start = startOf(round);
        require(block.timestamp >= start && block.timestamp < start + LOBBY_SECONDS, "lobby closed");
        require(generations.ownerOf(friend) == msg.sender, "not your Friend");
        require(entrant[round][friend] == address(0), "already entered");
        Round storage r = rounds[round];
        require(r.paid < ROUND_SIZE, "round full");
        entrant[round][friend] = msg.sender;
        r.paid += 1;
        _pull(ENTRY);
        emit Entered(round, friend, msg.sender);
    }

    /** Fixes the battle seed once entries have closed. Anyone can call it. */
    function lock(uint256 round) external {
        Round storage r = rounds[round];
        require(!r.locked, "locked");
        require(block.timestamp >= startOf(round) + LOBBY_SECONDS, "lobby open");
        r.locked = true;
        r.seed = uint256(keccak256(abi.encode(block.prevrandao, round)));
        emit Locked(round, r.seed);
    }

    /**
     * Sponsor any Friend in the battle: a shield or a medkit for 1 RF, or a second life for 2, then 4, then 8 RF.
     * The engine applies every payment this contract accepts at the tick of its block's timestamp.
     */
    function sponsor(uint256 round, uint256 friend, Item item) external nonReentrant {
        Round storage r = rounds[round];
        require(r.locked && !r.sponsorClosed && !r.settled, "sponsoring closed");
        uint256 price = ENTRY;
        if (item == Item.Revive) {
            uint256 used = revives[round][friend];
            require(used < MAX_REVIVES, "no second lives left");
            revives[round][friend] = used + 1;
            price = 2e18 << used;
        }
        _gameplay(price);
        emit Sponsored(round, friend, msg.sender, item, price);
    }

    /** The operator closes sponsoring when 25 Friends are left, so nobody can buy the finish (checkable by replay). */
    function closeSponsoring(uint256 round) external {
        require(msg.sender == operator, "operator");
        rounds[round].sponsorClosed = true;
        emit SponsoringClosed(round);
    }

    /** Locker cosmetics and shouts: pure gameplay payments, 50% burned and 50% to rewards. */
    function payGameplay(bytes32 kind, uint256 amount) external nonReentrant {
        require(amount > 0, "zero");
        _gameplay(amount);
        emit GameplayPaid(msg.sender, kind, amount);
    }

    /**
     * Pays a finished round. `wallets` and `amounts` are the ladder places and collected bounties from the engine;
     * `bountiesBurned` is what the storm and wild Friends took. Together they must equal the 0.8 RF per entry held
     * for the round, so the operator cannot pay out more or less than came in.
     */
    function settle(uint256 round, address[] calldata wallets, uint256[] calldata amounts, uint256 bountiesBurned)
        external
        nonReentrant
    {
        require(msg.sender == operator, "operator");
        Round storage r = rounds[round];
        require(r.locked && !r.settled && !r.refunded, "not settleable");
        require(r.paid >= MIN_PAID, "refund instead");
        require(wallets.length == amounts.length, "length");
        r.settled = true;
        uint256 total = bountiesBurned;
        for (uint256 i = 0; i < wallets.length; i++) {
            claimable[wallets[i]] += amounts[i];
            total += amounts[i];
        }
        require(total == uint256(r.paid) * (ENTRY - ENTRY_BURN - ENTRY_REWARDS), "must pay out exactly the pool");
        _burn(uint256(r.paid) * ENTRY_BURN + bountiesBurned);
        require(rf.transfer(rewards, uint256(r.paid) * ENTRY_REWARDS), "rewards transfer");
        emit Settled(round, total - bountiesBurned, bountiesBurned);
    }

    /** A round with fewer than 5 paid entries is free: every entry is returned whole, nothing is burned. */
    function refund(uint256 round, uint256[] calldata friends) external nonReentrant {
        Round storage r = rounds[round];
        require(block.timestamp >= startOf(round) + LOBBY_SECONDS, "lobby open");
        require(r.paid < MIN_PAID && !r.settled, "not a free round");
        if (!r.refunded) {
            r.refunded = true;
            emit Refunded(round);
        }
        for (uint256 i = 0; i < friends.length; i++) {
            address wallet = entrant[round][friends[i]];
            if (wallet == address(0)) continue;
            entrant[round][friends[i]] = address(0);
            claimable[wallet] += ENTRY;
        }
    }

    function claim() external nonReentrant {
        uint256 amount = claimable[msg.sender];
        require(amount > 0, "nothing to claim");
        claimable[msg.sender] = 0;
        require(rf.transfer(msg.sender, amount), "claim transfer");
    }

    function setOperator(address next) external {
        require(msg.sender == operator, "operator");
        operator = next;
    }

    function _pull(uint256 amount) private {
        require(rf.transferFrom(msg.sender, address(this), amount), "payment");
    }

    function _gameplay(uint256 amount) private {
        _pull(amount);
        uint256 burned = amount / 2;
        _burn(burned);
        require(rf.transfer(rewards, amount - burned), "rewards transfer");
    }

    function _burn(uint256 amount) private {
        if (amount == 0) return;
        totalBurned += amount;
        rf.burn(amount);
        emit Burned(amount);
    }
}
