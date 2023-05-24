import { Signer } from "@ethersproject/abstract-signer";
import { AddressZero } from "@ethersproject/constants";
import {
  time as blockTime,
  impersonateAccount,
  setBalance,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract } from "ethers";
import hre, { deployments, ethers, w3f } from "hardhat";
import { LensGelatoGPT, ILensHub } from "../typechain";
import { lens_hub_abi } from "../helpers/lens_hub_abi";
import {
  Web3FunctionUserArgs,
  Web3FunctionResultV2,
} from "@gelatonetwork/web3-functions-sdk";
import { Web3FunctionHardhat } from "@gelatonetwork/web3-functions-sdk/hardhat-plugin";
import { mockProfiles } from "./helpers/MockProfiles";
import { parseEther } from "ethers/lib/utils";

const FIRST_SENTENCE = "fist sentence";
const LONG_SENTENCE =
  "long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece";

describe.only("W3F", function () {
  let admin: Signer; // proxyAdmin
  let adminAddress: string;

  let lensGelatoW3f: Web3FunctionHardhat;
  let userArgs: Web3FunctionUserArgs;

  let lensGelatoGPT: LensGelatoGPT;
  let lensHub: ILensHub;

  let dedicatedMsgSenderAddress: string;
  let collectModuleAddress: string;
  let firstProfile: Signer;
  let firstProfileAddress: string;

  beforeEach("tests", async function () {
    if (hre.network.name !== "hardhat") {
      console.error("Test Suite is meant to be run on hardhat only");
      process.exit(1);
    }

    await deployments.fixture();

    [admin] = await ethers.getSigners();

    adminAddress = await admin.getAddress();
    await setBalance(adminAddress, ethers.utils.parseEther("1000"));
    const {
      lensHub: lensHubAddress,
      dedicatedMsgSender: dedicatedMsgSender,
      collectModule: collectModule,
    } = await hre.getNamedAccounts();

    dedicatedMsgSenderAddress = dedicatedMsgSender;
    collectModuleAddress = collectModule;
    lensGelatoGPT = (await ethers.getContractAt(
      "LensGelatoGPT",
      (
        await deployments.get("LensGelatoGPT")
      ).address
    )) as LensGelatoGPT;

    lensHub = new Contract(lensHubAddress, lens_hub_abi, admin) as ILensHub;
    firstProfileAddress = await lensHub.ownerOf(1);
    await impersonateAccount(firstProfileAddress);
    firstProfile = await ethers.getSigner(firstProfileAddress);

    userArgs = {
      lensGelatoGPT: lensGelatoGPT.address,
      lensHubAddress: lensHubAddress,
      collectModule: collectModuleAddress,
    };
  });

  it("W3F length", async () => {
    await lensHub
      .connect(firstProfile)
      .setDispatcher(1, dedicatedMsgSenderAddress);
    await lensGelatoGPT.connect(firstProfile).setPrompt(1, FIRST_SENTENCE);

    expect(await lensGelatoGPT.promptByProfileId(1)).to.be.eq(FIRST_SENTENCE);

    const storage = {
      nextPromptIndex: "0",
      lastPostTime: "0",
    };

    lensGelatoW3f = w3f.get("lens-ai");
    let { result } = await lensGelatoW3f.run({ userArgs, storage });
    result = result as Web3FunctionResultV2;

    expect(result.canExec).to.be.eq(true);

    if (result.canExec == true) {
      expect(result.callData.length).to.be.eq(2);
    }
  });

  it("W3F executes and publish post", async () => {
    await lensHub
      .connect(firstProfile)
      .setDispatcher(1, dedicatedMsgSenderAddress);
    await lensGelatoGPT.connect(firstProfile).setPrompt(1, FIRST_SENTENCE);

    expect(await lensGelatoGPT.promptByProfileId(1)).to.be.eq(FIRST_SENTENCE);

    const storage = {
      nextPromptIndex: "0",
      lastPostTime: "0",
    };

    lensGelatoW3f = w3f.get("lens-ai");
    let { result } = await lensGelatoW3f.run({ userArgs, storage });
    result = result as Web3FunctionResultV2;

    expect(result.canExec).to.be.eq(true);

    if (result.canExec == true) {
      await admin.sendTransaction({
        to: dedicatedMsgSenderAddress,
        value: ethers.utils.parseEther("1"),
        gasLimit: 10000000,
      });
      let data = result.callData[1];
      await impersonateAccount(dedicatedMsgSenderAddress);
      let dedicatedMsgSenderSigner = await ethers.getSigner(
        dedicatedMsgSenderAddress
      );
      await dedicatedMsgSenderSigner.sendTransaction({
        to: data.to,
        data: data.data,
      });

      const pubCount = await lensHub.getPubCount(1);
      const pub = await lensHub.getPub(1, +pubCount.toString());

      expect(pub.contentURI).to.be.eq(FIRST_SENTENCE);
    }
  });

  it.only("W3F executes query properly 15", async () => {
    await setBalance(adminAddress, parseEther("1000"));

    await mockProfiles(1, 15, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    const storage = {
      nextPromptIndex: "0",
      lastPostTime: "0",
    };

    lensGelatoW3f = w3f.get("lens-ai");
    let w3fResultCall1 = await lensGelatoW3f.run({ userArgs, storage });
    w3fResultCall1.result = w3fResultCall1.result as Web3FunctionResultV2;

    expect(w3fResultCall1.result.canExec).to.be.eq(true);

    if (w3fResultCall1.result.canExec == true) {
      expect(w3fResultCall1.result.callData.length).to.be.eq(11);
      expect(w3fResultCall1.storage.storage.nextPromptIndex).to.be.eq("10");
    }

    storage.nextPromptIndex = "10";
    let w3fResultCall2 = await lensGelatoW3f.run({ userArgs, storage });
    expect(w3fResultCall2.result.canExec).to.be.eq(true);

    if (w3fResultCall2.result.canExec == true) {
      expect(w3fResultCall2.result.callData.length).to.be.eq(6);
      expect(w3fResultCall2.storage.storage.nextPromptIndex).to.be.eq("0");
    }
  });

  it("W3F executes query properly 10", async () => {
    await mockProfiles(1, 10, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    const storage = {
      nextPromptIndex: "0",
      lastPostTime: "0",
    };

    lensGelatoW3f = w3f.get("lens-ai");
    let w3fResultCall1 = await lensGelatoW3f.run({ userArgs, storage });
    w3fResultCall1.result = w3fResultCall1.result as Web3FunctionResultV2;

    expect(w3fResultCall1.result.canExec).to.be.eq(true);

    if (w3fResultCall1.result.canExec == true) {
      expect(w3fResultCall1.result.callData.length).to.be.eq(11);
      expect(w3fResultCall1.storage.storage.nextPromptIndex).to.be.eq("10");
    }

    storage.nextPromptIndex = "10";
    let w3fResultCall2 = await lensGelatoW3f.run({ userArgs, storage });
    expect(w3fResultCall2.result.canExec).to.be.eq(false);
    expect(w3fResultCall2.storage.storage.nextPromptIndex).to.be.eq("0");
  });
});
