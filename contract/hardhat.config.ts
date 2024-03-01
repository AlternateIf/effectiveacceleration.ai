import "hardhat-tracer";
import { envconfig } from "./utils/config";
import { HardhatUserConfig } from "hardhat/config";
import "@typechain/hardhat";
import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "@nomicfoundation/hardhat-verify";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";
import "solidity-coverage";

import { inspect } from 'util';
inspect.defaultOptions.depth = 10;

// user created tasks
import "./tasks/index";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    mainnet: {
      url: envconfig.mainnet.provider_url,
      accounts: [`0x${envconfig.mainnet.private_key}`],
    },
    goerli: {
      url: envconfig.goerli.provider_url,
      accounts: [`0x${envconfig.goerli.private_key}`],
    },
    sepolia: {
      url: envconfig.sepolia.provider_url,
      accounts: [`0x${envconfig.sepolia.private_key}`],
    },
    arbgoerli: {
      url: envconfig.arbgoerli.provider_url,
      accounts: [`0x${envconfig.arbgoerli.private_key}`],
    },
    arbsepolia: {
      url: envconfig.arbsepolia.provider_url,
      accounts: [`0x${envconfig.arbsepolia.private_key}`],
    },
    nova: {
      url: envconfig.nova.provider_url,
      accounts: [`0x${envconfig.nova.private_key}`],
    },
  },
  typechain: {
    outDir: "typechain",
    target: "ethers-v5",
  },
  contractSizer: {},
  etherscan: {
    apiKey: envconfig.etherscan.api_key,
    customChains: [
      {
        network: "arbitrumNova",
        chainId: 42170,
        urls: {
          apiURL: "https://api-nova.arbiscan.io/api",
          browserURL: "https://nova.arbiscan.io"
        }
      }
    ],
  },
  sourcify: {
    enabled: true,
  },
};

export default config;
