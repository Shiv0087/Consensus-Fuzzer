// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IVault {
    function deposit() external payable;
    function withdraw(uint256 amount) external;
    function balanceOf(address) external view returns (uint256);
}

/// @notice Attempts to re-enter Vault.withdraw() from its own receive() hook.
/// Vault follows checks-effects-interactions (balance is decremented BEFORE
/// the external call), so this attack should fail identically on every node
/// regardless of client/hardfork — this is a real security property being
/// verified across all three, not a synthetic test.
contract Reentrant {
    IVault public vault;
    uint256 public reentryAttempts;
    bool public attacking;

    constructor(address _vault) {
        vault = IVault(_vault);
    }

    function attack() external payable {
        attacking = true;
        vault.deposit{value: msg.value}();
        vault.withdraw(msg.value);
        attacking = false;
    }

    receive() external payable {
        if (attacking && address(vault).balance >= 1 wei) {
            reentryAttempts += 1;
            // Try to withdraw again before the first call finishes.
            // Should revert if Vault correctly updated balance before sending.
            try vault.withdraw(msg.value) {
                // if this succeeds, that's a real reentrancy bug
            } catch {
                // expected: fails because balance was already zeroed
            }
        }
    }
}
