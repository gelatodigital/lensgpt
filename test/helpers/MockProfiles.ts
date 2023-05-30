import { Signer, ethers } from "ethers";
import { ILensHub, LensGelatoGPT } from "../../typechain";
import { HardhatRuntimeEnvironment } from "hardhat/types";

export const mockProfiles = async (
  init: number,
  total: number,
  config: {
    admin: Signer;
    lensHub: ILensHub;
    hre: HardhatRuntimeEnvironment;
    dedicatedMsgSenderAddress: string;
    lensGelatoGPT: LensGelatoGPT;
  }
) => {
  for (let i = init; i < init + total; i++) {
    console.log("\x1b[32m%s\x1b[0m", `    ✔ Mocking Lens Profile ${i}`);
    const profileAddress = await config.lensHub.ownerOf(i);
    const initialPoolEth = ethers.utils.parseEther("10");

    await config.admin.sendTransaction({
      to: profileAddress,
      value: initialPoolEth,
    });

    await config.lensHub.getDispatcher(i);

    //// Impersonating
    await config.hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [profileAddress],
    });

    const profile = await config.hre.ethers.provider.getSigner(profileAddress);

    await config.lensHub
      .connect(profile)
      .setDispatcher(i, config.dedicatedMsgSenderAddress);
    await config.lensHub.getDispatcher(i);

    const myPrompt = `test sentence nr ${i}`;
    await config.lensGelatoGPT.connect(profile).setPrompt(i, myPrompt);
  }
};
