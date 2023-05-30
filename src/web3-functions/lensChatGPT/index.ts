/* eslint-disable @typescript-eslint/naming-convention */
import {
  Web3Function,
  Web3FunctionContext,
} from "@gelatonetwork/web3-functions-sdk";
import { Contract, utils } from "ethers";
import { Configuration, OpenAIApi } from "openai";
import { v4 as uuidv4 } from "uuid";
import { Web3Storage, File, CIDString } from "web3.storage";
import { lensHubAbi } from "../../../helpers/lensHubAbi";
import {
  LensClient,
  PublicationMainFocus,
  PublicationMetadataDisplayTypes,
  production,
} from "@lens-protocol/client";
import { promptAbi } from "../../../helpers/promptAbi";
import { LensGelatoGPT } from "../../../typechain";
import { PromptStructOutput } from "../../../typechain/LensGelatoGPT";

Web3Function.onRun(async (context: Web3FunctionContext) => {
  const { userArgs, multiChainProvider, secrets, storage } = context;
  const provider = multiChainProvider.default();

  // User Secrets
  const WEB3_STORAGE_API_KEY = await secrets.get("WEB3_STORAGE_API_KEY");
  const SECRETS_OPEN_AI_API_KEY = await secrets.get("OPEN_AI_API_KEY");
  if (!WEB3_STORAGE_API_KEY || !SECRETS_OPEN_AI_API_KEY) {
    console.error("Error: Missing secrets");
    return {
      canExec: false,
      message: "Error: Missing Secrets",
    };
  }

  // User userArgs
  const lensGelatoGPTAddress = userArgs.lensGelatoGPT as string;
  const lensHubAddress = userArgs.lensHubAddress as string;
  const collectModuleAddress = userArgs.collectModule as string;
  if (
    !utils.isAddress(lensGelatoGPTAddress) ||
    !utils.isAddress(lensHubAddress) ||
    !utils.isAddress(collectModuleAddress)
  ) {
    console.error("Error: Invalid address userArgs");
    return {
      canExec: false,
      message: "Error: Invalid address userArgs",
    };
  }

  const NUMBER_OF_POSTS_PER_RUN = 5;
  const INTERVAL_IN_MIN = 480;

  const lastRunStartTime = parseInt(
    (await storage.get("lastRunStartTime")) ?? "0"
  );
  const nextPromptIndex = parseInt(
    (await storage.get("nextPromptIndex")) ?? "0"
  );

  const lensGelatoGpt = new Contract(
    lensGelatoGPTAddress,
    promptAbi,
    provider
  ) as LensGelatoGPT;

  const blockTime = (await provider.getBlock("latest")).timestamp;
  const isNewInterval = blockTime - lastRunStartTime >= INTERVAL_IN_MIN * 60;
  const lastIntervalRunFinished = nextPromptIndex == 0;

  const isNewcomerRun = await lensGelatoGpt.areThereNewProfileIds();
  const isScheduledRun = !isNewcomerRun && isNewInterval;

  if (lastIntervalRunFinished && !isNewcomerRun && !isNewInterval) {
    return {
      canExec: false,
      message:
        "Last run finished, but not newcomers, nor interval wait finished",
    };
  }

  const prompts: PromptStructOutput[] = [];

  const callDatas: Array<{ to: string; data: string }> = [];

  if (isNewcomerRun) {
    const allNewPrompts = await lensGelatoGpt.getNewPrompts();
    const firstSliceOfNewPrompts = allNewPrompts.slice(
      0,
      NUMBER_OF_POSTS_PER_RUN
    );

    // Add call to remove firstSliceOfNewPrompts
    // Assumption: in next run, the firstSliceOfNewPrompts will be the next ones
    const profileIds = firstSliceOfNewPrompts.map((map) => map.profileId);
    callDatas.push({
      to: lensGelatoGPTAddress,
      data: lensGelatoGpt.interface.encodeFunctionData("removeNewProfileIds", [
        profileIds,
      ]),
    });

    prompts.push(...firstSliceOfNewPrompts);
  } else {
    prompts.push(
      ...(await lensGelatoGpt.getPaginatedPrompts(
        nextPromptIndex,
        nextPromptIndex + NUMBER_OF_POSTS_PER_RUN
      ))
    );
  }

  const nonEmptyPrompts = prompts.filter(
    (prompt) => prompt.profileId.toString() !== "0"
  );

  for (const prompt of nonEmptyPrompts) {
    const { chainId } = await provider.getNetwork();

    // // In hardhat test, skip ChatGPT call & IPFS publication
    let contentURI;

    if (chainId != 31337) {
      // Get Sentence OpenAi
      let text: string | undefined = undefined;
      try {
        const openai = new OpenAIApi(
          new Configuration({ apiKey: SECRETS_OPEN_AI_API_KEY })
        );
        const response = await openai.createCompletion({
          model: "text-davinci-003",
          prompt: ` ${prompt.prompt} in less than 50 words.`,
          temperature: 1,
          max_tokens: 256,
          top_p: 1,
          frequency_penalty: 1.5,
          presence_penalty: 1,
        });
        text = response.data.choices[0].text as string;
        if (text === undefined) {
          console.error(`Error: OpenAI: NO TEXT`);
          return { canExec: false, message: "Error: OpenAI: NO TEXT" };
        }
      } catch (error) {
        console.error(`Error: OpenAI: ${error}`);
        return { canExec: false, message: "Error: OpenAI" };
      }

      console.log(`Text generated: ${text}`);

      // Get Lens Metadata and validate
      const pub = getLensPublicationMetaData(text);
      const lensClient = new LensClient({
        environment: production,
      });

      try {
        const validateResult = await lensClient.publication.validateMetadata(
          pub
        );
        if (!validateResult.valid) {
          console.error(`Error: Metadata is not valid.`);
          return { canExec: false, message: "LensClient: Metadata invalid" };
        }
      } catch (error) {
        console.error(`Error: lensClient validateMetadata`);
        return {
          canExec: false,
          message: "Error: lensClient validateMetadata",
        };
      }

      // Upload metadata to IPFS
      const storage = new Web3Storage({ token: WEB3_STORAGE_API_KEY });
      const myFile = new File([JSON.stringify(pub)], "publication.json");

      let cid: CIDString;
      try {
        cid = await storage.put([myFile]);
      } catch (error) {
        console.error(`Error: Web3Storage`);
        return {
          canExec: false,
          message: "Error: Web3Storage: validateMetadata",
        };
      }

      contentURI = `https://${cid}.ipfs.w3s.link/publication.json`;

      console.log(`Publication IPFS: ${contentURI}`);
    } else {
      contentURI = prompt.prompt;
    }
    const postData = {
      profileId: prompt.profileId,
      contentURI,
      collectModule: collectModuleAddress, //collect Module
      collectModuleInitData: "0x",
      referenceModule: "0x0000000000000000000000000000000000000000", // reference Module
      referenceModuleInitData: "0x",
    };

    const iface = new utils.Interface(lensHubAbi);

    callDatas.push({
      to: lensHubAddress,
      data: iface.encodeFunctionData("post", [postData]),
    });
  }

  // Process storage updates only for scheduled runs
  if (isScheduledRun) {
    const totalNumberOfProfiles =
      await lensGelatoGpt.getTotalNumberOfProfiles();

    const isLastRun =
      nextPromptIndex + NUMBER_OF_POSTS_PER_RUN >=
      totalNumberOfProfiles.toNumber();

    if (lastIntervalRunFinished) {
      await storage.set("lastRunStartTime", blockTime.toString());
    } else if (isLastRun) {
      await storage.set("nextPromptIndex", "0");
    } else {
      await storage.set(
        "nextPromptIndex",
        (nextPromptIndex + NUMBER_OF_POSTS_PER_RUN).toString()
      );
    }
  }

  return callDatas.length == 0
    ? { canExec: false, message: "Not Prompts to post" }
    : {
        canExec: true,
        callData: callDatas,
      };
});

const getLensPublicationMetaData = (_text: string) => {
  return {
    version: "2.0.0",
    metadata_id: uuidv4(),
    content: `${_text} \n\n #lensgpt #gelatonetwork`,
    external_url: "https://lenster.xyz/",
    image: null,
    imageMimeType: null,
    name: "Post by GelatoGPT",
    tags: [],
    animation_url: null,
    mainContentFocus: PublicationMainFocus.TextOnly,
    contentWarning: null,
    attributes: [
      {
        traitType: "type",
        displayType: PublicationMetadataDisplayTypes.String,
        value: "text_only",
      },
    ],
    media: [],
    locale: "en-GB",
    appId: "Lenster",
  };
};
