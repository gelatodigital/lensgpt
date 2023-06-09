# EthDamm Lens AI posting

## Summary

This projects showcases how to post messages generated by OpenAI with help of Gelato Web3 functions

LensGelatoGPT contract deployed on Polygon: [https://polygonscan.com/address/0x4b34ead10c478f61f88a51698a62716ca5e19038](https://polygonscan.com/address/0x4b34ead10c478f61f88a51698a62716ca5e19038)

<!-- Web3 Function on polygon [https://beta.app.gelato.network/task/0xff44249fd3c24fe6cd87ec864bd97bfd1a4640e326ce15ede476e43158492d97?chainId=80001](https://beta.app.gelato.network/task/0xff44249fd3c24fe6cd87ec864bd97bfd1a4640e326ce15ede476e43158492d97?chainId=80001) -->

LensHub on Polygon [https://polygonscan.com/address/0xdb46d1dc155634fbc732f92e853b10b288ad5a1d](https://polygonscan.com/address/0xdb46d1dc155634fbc732f92e853b10b288ad5a1d)

DedicatedMsgSender On polygon = 0xbb97656cd5fece3a643335d03c8919d5e7dcd225

You can create a Profile on Lens testnet (polygon) on [https://lenster.xyz/](https://lenster.xyz/)

### Try it out the wasy way

You can go to our deployed app on polygon at [https://ethdam-gelato.web.app/](https://ethdam-gelato.web.app/)

### Try it out the dev way

1. Go to [https://lenster.xyz/](https://lenster.xyz/) and create a Profile on polygon. Copy the ProfileId.

2. Go to the [lensHub contract](https://polygonscan.com/address/0x4b34ead10c478f61f88a51698a62716ca5e19038) and `Write as a Proxy` the method: `setDispacher(ProfileId,0xcc53666e25bf52c7c5bc1e8f6e1f6bf58e871659)`

3. Go to [LensGelatoGPT contract](https://polygon.polygonscan.com/address/0x89ed9ae7efad72c742a97e42c06cb682d1fa5e27) and `write as a Proxy`the method `setPrompt(0,ProfileId,"YOUR PROMPT"). "YOU PROMPT" will be the basis for ChatGPT.

4. Sit and wait, latest in 30 min you will have delivered a Lens Gelato GTP post into your feed.

### Lens Settings:

In order to be able to post messages on behalf of the Lens Profile owner, it is required to set the dedicated message sender as dispatcher

```ts
lensHub.setDispatcher(profileId, dedicatedMsgSender);
```

### Secrets

A Provider URL, an OpenAi key is required, and a web3.sgtorage key is also required as

Please cope .env.template in your roor folder --> to .env and input

```ts
PROVIDER_URLS= YOUR RPC
```

Please cope .env.template in your web3-functions/lens-ai --> to .env and input

```ts
OPEN_AI_API_KEY=YOUR KEY
WEB3_STORAGE_API_KEY=YOUR KEY
```

For web3.storage keys please go [http://web3.storage/](http://web3.storage/)

### Web3 Functions Step

1. Generate OpenAi text:

```ts
const response = await openai.createCompletion({
  model: "text-davinci-003",
  prompt: "Please resume what would say Confucio about politics in 15 words",
  temperature: 0,
  max_tokens: 30,
});
const text = response.data.choices[0].text;
```

2.  Build and validate Publication Metadata

```ts
const uuid = uuidv4();
const pub = {
  ...
  ...
};

// Checking Metadata is Correct
const lensClient = new LensClient({
  environment: production,
});
const validateResult = await lensClient.publication.validateMetadata(pub);

if (!validateResult.valid) {
  throw new Error(`Metadata is not valid.`);
}
```

3. Upload metadata to IPFS

```ts
const storage = new Web3Storage({ token: WEB3_STORAGE_API_KEY });
const myFile = new File([JSON.stringify(pub)], "publication.txt");
const cid = await storage.put([myFile]);
```

3.  Prepare callData and return

```ts
const postData = {
  profileId: profileID
  contentURI: `https://${cid}.ipfs.w3s.link/publication.json`,
  collectModule: "0xa31FF85E840ED117E172BC9Ad89E55128A999205", //No collect Module
  collectModuleInitData: "0x",
  referenceModule: "0x0000000000000000000000000000000000000000", // reference Module
  referenceModuleInitData: "0x",
};

const lensHubAddress = "0xDb46d1Dc155634FbC732f92E853b10B288AD5a1d";
const iface = new utils.Interface(lens_hub_abi);
return {
  canExec: true,
  callData: [
    {
      to: lensHubAddress,
      data: iface.encodeFunctionData("post", [postData]),
    },
  ],
};
```


