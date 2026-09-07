// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Uses EIP-1153 transient storage (TSTORE/TLOAD), activated in the
/// Cancun hardfork. A node still enforcing pre-Cancun rules (e.g. Shanghai)
/// does not recognise these opcodes and will fail to execute this
/// transaction the same way an up-to-date node does.
///
/// This is not a synthetic bug — it is the exact mechanism behind real
/// consensus incidents: a subset of network nodes running client software
/// that has not activated the latest hardfork disagrees with the rest of
/// the network about how (or whether) a transaction executes.
contract TransientCounter {
    function bump() external returns (uint256 newValue) {
        assembly {
            let cur := tload(0)
            cur := add(cur, 1)
            tstore(0, cur)
            newValue := cur
        }
    }
}
