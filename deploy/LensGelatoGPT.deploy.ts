import hre from "hardhat";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { sleep } from "../src/utils";

const isHardhat = hre.network.name === "hardhat";

const func: DeployFunction = async (hre: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer, lensHub, dedicatedMsgSender } = await getNamedAccounts();

  if (!isHardhat) {
    console.log(
      `Deploying LensGelatoGPT to ${hre.network.name}. Hit ctrl + c to abort`
    );
    await sleep(5000);
  }

  await deploy("LensGelatoGPT", {
    from: deployer,
    proxy: true,
    args: [lensHub, dedicatedMsgSender],
    log: true,
  });
};

func.skip = async () => {
  return false;
};
func.tags = ["LensGelatoGPT"];

export default func;
