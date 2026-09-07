// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal deposit/withdraw vault used as the baseline fuzz target.
/// Its logic is deliberately simple so that ANY disagreement between nodes
/// running it can only be explained by a client/EVM-level bug, not a
/// contract bug.
contract Vault {
    mapping(address => uint256) public balanceOf;
    uint256 public totalDeposits;

    event Deposited(address indexed who, uint256 amount);
    event Withdrawn(address indexed who, uint256 amount);

    function deposit() external payable {
        balanceOf[msg.sender] += msg.value;
        totalDeposits += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount) external {
        require(balanceOf[msg.sender] >= amount, "insufficient balance");
        balanceOf[msg.sender] -= amount;
        totalDeposits -= amount;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");
        emit Withdrawn(msg.sender, amount);
    }

    /// @dev Intentionally accepts raw boundary-value input so the fuzzer can
    /// push unusual numbers (0, max uint, off-by-one) through real EVM
    /// arithmetic paths.
    function stress(uint256 a, uint256 b) external pure returns (uint256) {
        unchecked {
            return (a + b) * (a - b);
        }
    }
}
