# Connect in minutes

The SDK is a local release artifact, not published to npm. Requires Node 22+. From the reference repository run `npm run build:sdk` then `npm pack ./packages/sdk`; distribute the resulting `ript-sdk-0.1.0.tgz` together with these instructions. In a new project:

```sh
npm init -y
npm install --ignore-scripts ./ript-sdk-0.1.0.tgz
```

Save `read.mjs`:

```js
import { createRiptServerClient } from '@ript/sdk/server';
const sdk = createRiptServerClient({
  baseUrl: process.env.RIPT_API_URL,
  environment: 'sandbox',
  credentials: { gachaKey: process.env.RIPT_GACHA_KEY },
});
const catalog = await sdk.gacha.packs();
const treasury = await sdk.treasury.get();
console.log({ partnerId: catalog.partnerId, treasury });
```

Set your own HTTPS root API origin and matching partner sandbox Gacha key in server environment variables, then run `node read.mjs`. Never paste a key into a browser bundle or commit it. Treasury endpoints are deployed on the Ript API. Other API deployments must provide the same routes; a 404 is not an empty treasury. For a running framework-free dashboard copy the two sibling `examples/server` and `examples/dashboard` folders and follow the server README. Pack artwork remains catalog/API data; no application checkout or project-specific address is required.

Browser applications use `createRiptBrowserClient({environment:'sandbox'})` from `@ript/sdk/browser`, backed by your authenticated same-origin proxy. The example exposes only two treasury reads. The reference application additionally maps Gacha, Inventory and other allowlisted routes; see its server proxies. Neither SDK constructor provisions accounts.
