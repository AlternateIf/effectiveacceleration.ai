import { ethers, upgrades } from "hardhat";
import { MarketplaceV1 as Marketplace } from '../typechain-types/contracts/MarketplaceV1';
import * as fs from 'fs'

async function main() {
  const signers = await ethers.getSigners();
  const deployer   = signers[0];

  console.log("Deploying contracts with the account:", deployer.address);

  console.log('Treasury address', deployer.address);

  const Marketplace = await ethers.getContractFactory(
    "MarketplaceV1"
  );
  const marketplace = await upgrades.deployProxy(Marketplace, [
    deployer.address, // deployer as treasury
  ]);
  await marketplace.waitForDeployment();
  console.log("Marketplace deployed to:", marketplace.target);

  // SAVE CONFIG
  const configPath = __dirname + '/config.json';
  fs.writeFileSync(configPath, JSON.stringify({
    marketplaceAddress: marketplace.target,
  }, null, 2));
  console.log('Saved config to', configPath);
  process.exit(0)
}


main();
