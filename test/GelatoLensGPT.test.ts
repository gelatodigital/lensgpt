import { Signer } from "@ethersproject/abstract-signer";
import {
  impersonateAccount,
  setBalance,
} from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { Contract } from "ethers";
import hre, { deployments, ethers } from "hardhat";
import { LensGelatoGPT, ILensHub } from "../typechain";
import { lensHubAbi } from "../helpers/lensHubAbi";
import { mockProfiles } from "./helpers/MockProfiles";
import { parseEther } from "ethers/lib/utils";

const FIRST_SENTENCE = "fist sentence";
const LONG_SENTENCE =
  "long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece long sentece";

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

    lensHub = new Contract(lensHubAddress, lensHubAbi, admin) as ILensHub;
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

    const initialBalance = await firstProfile.getBalance();

    await lensGelatoGPT.collectFee(firstProfileAddress);

    const finishBalance = await firstProfile.getBalance();

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

  it("GelatoLensGPT.getPaginatedPrompts: query", async () => {
    await mockProfiles(1, 15, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    expect(
      (await lensGelatoGPT.connect(admin).getPaginatedPrompts(0, 10)).length
    ).to.be.eq(10);

    expect(
      (await lensGelatoGPT.connect(admin).getPaginatedPrompts(10, 20)).length
    ).to.be.eq(5);
  });

  it("GelatoLensGPT.getNewPrompts: query", async () => {
    await mockProfiles(1, 15, {
      admin,
      dedicatedMsgSenderAddress,
      hre,
      lensGelatoGPT,
      lensHub,
    });

    expect(
      (await lensGelatoGPT.connect(admin).getNewPrompts()).length
    ).to.be.eq(15);

    await setBalance(dedicatedMsgSenderAddress, parseEther("1"));
    await impersonateAccount(dedicatedMsgSenderAddress);
    const dedicatedMsgSenderSigner = await ethers.getSigner(
      dedicatedMsgSenderAddress
    );
    await lensGelatoGPT
      .connect(dedicatedMsgSenderSigner)
      .removeNewProfileIds([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

    expect(
      (await lensGelatoGPT.connect(admin).getNewPrompts()).length
    ).to.be.eq(0);
  });
});
