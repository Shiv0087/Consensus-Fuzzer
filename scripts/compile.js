const fs = require("fs");
const path = require("path");
const solc = require("solc");

const CONTRACTS_DIR = path.join(__dirname, "..", "contracts");
const ARTIFACTS_DIR = path.join(__dirname, "..", "artifacts-manual");

function findSources() {
  const files = fs.readdirSync(CONTRACTS_DIR).filter((f) => f.endsWith(".sol"));
  const sources = {};
  for (const f of files) {
    sources[f] = { content: fs.readFileSync(path.join(CONTRACTS_DIR, f), "utf8") };
  }
  return sources;
}

function compile() {
  const input = {
    language: "Solidity",
    sources: findSources(),
    settings: {
      evmVersion: "cancun",
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"]
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));

  if (output.errors) {
    const fatal = output.errors.filter((e) => e.severity === "error");
    for (const e of output.errors) console.log(e.formattedMessage);
    if (fatal.length) process.exit(1);
  }

  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  for (const fileName of Object.keys(output.contracts)) {
    for (const contractName of Object.keys(output.contracts[fileName])) {
      const c = output.contracts[fileName][contractName];
      const artifact = {
        contractName,
        abi: c.abi,
        bytecode: "0x" + c.evm.bytecode.object
      };
      fs.writeFileSync(
        path.join(ARTIFACTS_DIR, `${contractName}.json`),
        JSON.stringify(artifact, null, 2)
      );
      console.log(`compiled ${contractName} -> artifacts-manual/${contractName}.json`);
    }
  }
}

compile();
