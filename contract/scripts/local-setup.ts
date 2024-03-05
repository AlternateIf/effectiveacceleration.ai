import { ethers, upgrades } from "hardhat";
import { MarketplaceV1 as Marketplace } from '../typechain-types/contracts/MarketplaceV1';
import { FakeToken } from '../typechain-types/contracts/unicrow/FakeToken';
import * as fs from 'fs'

async function main() {
  const signers = await ethers.getSigners();
  const deployer   = signers[0];

  console.log("Deploying contracts with the account:", deployer.address);

  const FakeToken = await ethers.getContractFactory("FakeToken");
  const fakeToken = await FakeToken.deploy("Test", "TST");

  const Marketplace = await ethers.getContractFactory(
    "MarketplaceV1"
  );
  const marketplace = await upgrades.deployProxy(Marketplace, [
    deployer.address, // deployer as treasury
  ]);
  await marketplace.deployed();
  console.log("Marketplace deployed to:", marketplace.address);

  // SAVE CONFIG
  const configPath = __dirname + '/config.json';
  fs.writeFileSync(configPath, JSON.stringify({
    marketplaceAddress: marketplace.address,
  }, null, 2));
  console.log('Saved config to', configPath);
  process.exit(0)
}


main();
