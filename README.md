# EthDamm Lens AI posting

## Summary
This projects showcases how to post messages generated by OpenAI with help of Web3 functions

### Lens Setings:
In order to be able to post messages on behalf of the Lens Profile owner, it is required to set the dedicated message sender as dispatcher

```ts
lensHub.setDispatcher(profileId,dedicatedMsgSender)
```

### Secrets
A Provider URL, an OpenAi key is required, and a web3.sgtorage key is also required as

Please cope .env.template in your roor folder --> to .env and input 
```ts
PROVIDER_URLS= YOUR RPC
```

Please cope .env.template in your web3-functions/lens-ai  --> to .env and input 
```ts
SECRETS_OPEN_AI_API_KEY=YOUR KEY
SECRETS_WEB3_STORAGE_API_KEY=YOUR KEY
```


For web3.storage keys please go [http://web3.storage/](http://web3.storage/)


### Web3 Functions Step

1) Generate OpenAi text:
```ts
  const response = await openai.createCompletion({
    model: "text-davinci-003",
    prompt: "Please resume what would say Confucio about politics in 15 words",
    temperature: 0,
    max_tokens: 30,
  });
  const text = response.data.choices[0].text;
```

2)  Build and validate Publication Metadata
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

3) Upload metadata to IPFS

```ts
    const storage = new Web3Storage({ token: WEB3_STORAGE_API_KEY });
    const myFile = new File([JSON.stringify(pub)], "publication.txt");
    const cid = await storage.put([myFile]);
```


3)  Prepare callData and return
```ts
    const postData = {
      profileId: "22424", //ProfileID
      contentURI: `ipfs://${cid}`,
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

// TODO WHEN final version extend README