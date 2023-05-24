import { Signer } from "@ethersproject/abstract-signer";
import { AddressZero } from "@ethersproject/constants";
import {
  time as blockTime,
  impersonateAccount,
  setBalance,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { BigNumber, Contract, constants } from "ethers";
import hre, { deployments, ethers } from "hardhat";
import { LensGelatoGPT, ILensHub } from "../typechain";
import { lens_hub_abi } from "../helpers/lens_hub_abi";
import { mockProfiles } from "./helpers/MockProfiles";

const FIRST_SENTENCE = "fist sentence";
const LONG_SENTENCE =
  "long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece";
const WITHDRAWAL_LOCK_PERIOD = 60 * 60 * 24 * 31 * 3;

describe("GelatoLensGPT.sol", function () {
  let admin: Signer; // proxyAdmin
  let adminAddress: string;

  let lensGelatoGPT: LensGelatoGPT;
  let lensHub: ILensHub;

  let dedicatedMsgSenderAddress: string;

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

    const { lensHub: lensHubAddress, dedicatedMsgSender: dedicatedMsgSender } =
      await hre.getNamedAccounts();

    dedicatedMsgSenderAddress = dedicatedMsgSender;

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
  });

  it("GelatoLensGPT.setPrompt: onlyProfileOwner", async () => {
    await expect(lensGelatoGPT.setPrompt(1, FIRST_SENTENCE)).to.be.revertedWith(
      "LensGelatoGPT.onlyProfileOwner"
    );
  });

  it("GelatoLensGPT.setPrompt: wo dispatcher", async () => {
    await expect(
      lensGelatoGPT.connect(firstProfile).setPrompt(1, FIRST_SENTENCE)
    ).to.be.revertedWith("LensGelatoGPT.setPrompt: dispatcher");
  });

  it("GelatoLensGPT.setPrompt: dispatcher", async () => {
    await lensHub
      .connect(firstProfile)
      .setDispatcher(1, dedicatedMsgSenderAddress);
    await lensGelatoGPT.connect(firstProfile).setPrompt(1, FIRST_SENTENCE);

    expect(await lensGelatoGPT.promptByProfileId(1)).to.be.eq(FIRST_SENTENCE);
  });

  it("GelatoLensGPT.setPrompt: length", async () => {
    await lensHub
      .connect(firstProfile)
      .setDispatcher(1, dedicatedMsgSenderAddress);

    await expect(
      lensGelatoGPT.connect(firstProfile).setPrompt(1, LONG_SENTENCE)
    ).to.be.revertedWith("LensGelatoGPT.setPrompt: length");
  });

  it("GelatoLensGPT.setFee: fee", async () => {
    await lensGelatoGPT.setFee(ethers.utils.parseEther("1"));

    await lensHub
      .connect(firstProfile)
      .setDispatcher(1, dedicatedMsgSenderAddress);

    await expect(
      lensGelatoGPT.connect(firstProfile).setPrompt(1, FIRST_SENTENCE)
    ).to.be.revertedWith("LensGelatoGPT.setPrompt: fee");

    await lensGelatoGPT
      .connect(firstProfile)
      .setPrompt(1, FIRST_SENTENCE, { value: ethers.utils.parseEther("1") });
  });

  it("GelatoLensGPT.collectFee: fee", async () => {
    await lensGelatoGPT.setFee(ethers.utils.parseEther("1"));

    await lensHub
      .connect(firstProfile)
      .setDispatcher(1, dedicatedMsgSenderAddress);

    await lensGelatoGPT
      .connect(firstProfile)
      .setPrompt(1, FIRST_SENTENCE, { value: ethers.utils.parseEther("1") });

    let initialBalance = await firstProfile.getBalance();

    await lensGelatoGPT.collectFee(firstProfileAddress);

    let finishBalance = await firstProfile.getBalance();

    expect(initialBalance.add(ethers.utils.parseEther("1"))).to.eq(
      finishBalance
    );
  });

  it("GelatoLensGPT.stopPrompt: onlyProfileOwner", async () => {
    await lensHub
      .connect(firstProfile)
      .setDispatcher(1, dedicatedMsgSenderAddress);
    await lensGelatoGPT.connect(firstProfile).setPrompt(1, FIRST_SENTENCE);

    expect(await lensGelatoGPT.promptByProfileId(1)).to.be.eq(FIRST_SENTENCE);

    await expect(lensGelatoGPT.stopPrompt(1)).to.be.revertedWith(
      "LensGelatoGPT.onlyProfileOwner"
    );
  });

  it("GelatoLensGPT.stopPrompt: stop", async () => {
    await lensHub
      .connect(firstProfile)
      .setDispatcher(1, dedicatedMsgSenderAddress);
    await lensGelatoGPT.connect(firstProfile).setPrompt(1, FIRST_SENTENCE);

    expect(await lensGelatoGPT.promptByProfileId(1)).to.be.eq(FIRST_SENTENCE);
    await lensGelatoGPT.connect(firstProfile).stopPrompt(1);
    expect(await lensGelatoGPT.promptByProfileId(1)).to.be.eq("");
  });

  it("GelatoLensGPT.getPaginatedPrompts: query not in run", async () => {
    await mockProfiles(1, 3, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    let result = await lensGelatoGPT
      .connect(admin)
      .getPaginatedPrompts(0, false);

    expect(result.results.length).to.be.eq(10);

    expect(result.nextPromptIndex).to.be.eq(0);

    expect(result.newcomersPointer).to.be.eq(3);

    expect(
      result.results.filter((fil) => fil.profileId.toString() != "0").length
    ).to.be.eq(3);
  });

  it("GelatoLensGPT.getPaginatedPrompts: query in run", async () => {
    await mockProfiles(1, 3, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    let result = await lensGelatoGPT
      .connect(admin)
      .getPaginatedPrompts(0, true);

    expect(result.results.length).to.be.eq(10);

    expect(result.nextPromptIndex).to.be.eq(3);

    expect(result.newcomersPointer).to.be.eq(3);

    expect(
      result.results.filter((fil) => fil.profileId.toString() != "0").length
    ).to.be.eq(6);
  });

  it("GelatoLensGPT.getPaginatedPrompts: fault dispatcher skip", async () => {
    await mockProfiles(1, 5, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    let result = await lensGelatoGPT
      .connect(admin)
      .getPaginatedPrompts(0, true);

    const firstProfileResult = result.results[0];

    let firstProfileAddressResult = await lensHub.ownerOf(
      firstProfileResult.profileId
    );

    await impersonateAccount(firstProfileAddressResult);
    let firstProfileResultSigner = await ethers.getSigner(
      firstProfileAddressResult
    );

    await lensHub
      .connect(firstProfileResultSigner)
      .setDispatcher(firstProfileResult.profileId, constants.AddressZero);

    result = await lensGelatoGPT.connect(admin).getPaginatedPrompts(0, true);

    expect(result.results.length).to.be.eq(10);

    expect(result.nextPromptIndex).to.be.eq(4);

    expect(result.newcomersPointer).to.be.eq(5);
  });

  it("GelatoLensGPT.getPaginatedPrompts: newcomers only next run", async () => {
    await mockProfiles(1, 5, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    await impersonateAccount(dedicatedMsgSenderAddress);
    let dedicatedMsgSenderSigner = await ethers.getSigner(
      dedicatedMsgSenderAddress
    );

    let initialPoolEth = ethers.utils.parseEther("1");

    await admin.sendTransaction({
      to: dedicatedMsgSenderAddress,
      value: initialPoolEth,
    });

    await lensGelatoGPT.connect(dedicatedMsgSenderSigner).updateNewcomersSet(5);

    let result = await lensGelatoGPT
      .connect(admin)
      .getPaginatedPrompts(0, true);

    expect(result.results.length).to.be.eq(10);

    expect(result.nextPromptIndex).to.be.eq(5);

    expect(result.newcomersPointer).to.be.eq(0);

    expect(
      result.results.filter((fil) => fil.profileId.toString() != "0").length
    ).to.be.eq(5);
  });

  it("GelatoLensGPT.getPaginatedPrompts: newcomers pushed when in run", async () => {
    await mockProfiles(1, 15, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    await impersonateAccount(dedicatedMsgSenderAddress);
    let dedicatedMsgSenderSigner = await ethers.getSigner(
      dedicatedMsgSenderAddress
    );

    let initialPoolEth = ethers.utils.parseEther("1");

    await admin.sendTransaction({
      to: dedicatedMsgSenderAddress,
      value: initialPoolEth,
    });

    await lensGelatoGPT
      .connect(dedicatedMsgSenderSigner)
      .updateNewcomersSet(15);

    await mockProfiles(16, 3, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    let result = await lensGelatoGPT
      .connect(admin)
      .getPaginatedPrompts(0, true);

    expect(result.results.length).to.be.eq(10);

    expect(result.nextPromptIndex).to.be.eq(7);

    expect(result.newcomersPointer).to.be.eq(3);

    await lensGelatoGPT.connect(dedicatedMsgSenderSigner).updateNewcomersSet(3);

    result = await lensGelatoGPT.connect(admin).getPaginatedPrompts(7, true);

    expect(+result.results[0].profileId.toString()).to.be.eq(8);

    expect(result.nextPromptIndex).to.be.eq(17);

    expect(result.newcomersPointer).to.be.eq(0);

    result = await lensGelatoGPT.connect(admin).getPaginatedPrompts(17, true);

    expect(result.results.length).to.be.eq(10);

    expect(+result.results[0].profileId.toString()).to.be.eq(18);

    expect(result.nextPromptIndex).to.be.eq(18);

    expect(result.newcomersPointer).to.be.eq(0);

    expect(
      result.results.filter((fil) => fil.profileId.toString() != "0").length
    ).to.be.eq(1);
  });

  it("GelatoLensGPT.getPaginatedPrompts: only newcomers returned when not in run", async () => {
    await mockProfiles(1, 15, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    await impersonateAccount(dedicatedMsgSenderAddress);
    let dedicatedMsgSenderSigner = await ethers.getSigner(
      dedicatedMsgSenderAddress
    );

    let initialPoolEth = ethers.utils.parseEther("1");

    await admin.sendTransaction({
      to: dedicatedMsgSenderAddress,
      value: initialPoolEth,
    });

    await lensGelatoGPT.connect(dedicatedMsgSenderSigner).updateNewcomersSet(5);

    let result = await lensGelatoGPT
      .connect(admin)
      .getPaginatedPrompts(0, false);

    expect(result.results.length).to.be.eq(10);

    expect(result.nextPromptIndex).to.be.eq(0);

    expect(result.newcomersPointer).to.be.eq(10);
    expect(+result.results[0].profileId.toString()).to.be.eq(15);
    expect(+result.results[9].profileId.toString()).to.be.eq(10);
  });
});
