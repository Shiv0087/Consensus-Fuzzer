require("@nomicfoundation/hardhat-toolbox");

/** Node C — simulates an OUTDATED client version still running Shanghai rules.
 *  This is modeled directly on real incidents: consensus splits have historically
 *  happened when a subset of network nodes ran client software that hadn't
 *  activated the latest hardfork yet, so they disagreed on how to execute
 *  certain transactions (e.g. transient storage opcodes introduced in Cancun). */
module.exports = {
  solidity: { version: "0.8.24", settings: { evmVersion: "cancun" } },
  networks: {
    hardhat: {
      chainId: 31337,
      hardfork: "shanghai",
      mining: { auto: true },
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        accountsBalance: "10000000000000000000000"
      }
    }
  }
};
