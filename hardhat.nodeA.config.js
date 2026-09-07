require("@nomicfoundation/hardhat-toolbox");

/** Node A — simulates a client running the CURRENT hardfork (Cancun) */
module.exports = {
  solidity: { version: "0.8.24", settings: { evmVersion: "cancun" } },
  networks: {
    hardhat: {
      chainId: 31337,
      hardfork: "cancun",
      mining: { auto: true },
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        accountsBalance: "10000000000000000000000"
      }
    }
  }
};
