# Ript Builder Kit

An API integration reference for builders and AI coding agents: a TypeScript SDK, a working reference application, a standalone treasury dashboard, and generated OpenAPI contracts.

Bring your own Ript service credentials. Accounts, pack artwork and treasury metadata come from the API; no existing application checkout or project ID is required. This repository contains a local integration server, not the Ript backend.

## Start here

Requires Node.js 22+ and npm.

```sh
git clone https://github.com/Belacosaur/ript-builder-kit.git
cd ript-builder-kit
npm ci
npm run build
npm test
```

- [SDK quickstart](docs/builders/quickstart.md): integrate with your own HTTPS root API origin and explicit sandbox/live environment.
- [Standalone dashboard](examples/server/README.md): two fixed treasury reads, with no framework or bundler.
- [AI instructions](docs/builders/ai-instructions.md) and [llms.txt](llms.txt): supported operations, credential boundaries and recovery rules.
- [OpenAPI 3.1](docs/openapi.json): supported upstream routes and validated request schemas.
- [Authentication](docs/builders/authentication.md), [treasury](docs/builders/treasury.md) and [recovery](docs/builders/recovery.md).

## Run the reference application

After building, set `GACHA_SANDBOX_KEY` in your server environment and run `npm start`. Open http://127.0.0.1:4315/. See [.env.example](.env.example) for optional service credentials. The root application does not automatically load `.env`; set environment variables in your shell. Never place service credentials in browser code.

The reference application deliberately restricts its upstream to the approved Ript API origin in [server/config.ts](server/config.ts). The standalone SDK and treasury example accept your explicit HTTPS API origin. Wallet signing requires a compatible injected Solana wallet; financial mutations require browser Web Locks. The application binds to loopback. Remote hosting needs your own user authentication and authorization.

## Use the SDK independently

```sh
npm run build:sdk
npm pack ./packages/sdk
```

Install the resulting `ript-sdk-0.1.0.tgz` in your own project. The SDK is not currently published to npm. It has no runtime dependencies and offers separate `@ript/sdk/server` and `@ript/sdk/browser` entry points. Server credentials remain server-side; browser calls use an authenticated same-origin proxy.

Pack images remain API catalog data. No private assets or account records are bundled.

## Verification and API availability

`npm test` builds the SDK and reference application and runs local contract, transport, recovery and UI fixture tests. `npm run build:openapi` regenerates the contract. Use `npm run smoke`, `npm run check:readiness` and `npm run acceptance:verify` only with your own configured API and evidence; generated local evidence is ignored by Git.

Treasury snapshot/activity and Gacha receipts require corresponding backend deployment. They are not deployed by this repository, and deployed acceptance remains unverified. Missing funds stay unknown. Live is an API environment, not proof of mainnet. Aggregator is paused; local fixtures do not certify real settlement or physical fulfilment. See [capability boundaries](docs/backend-capability-gaps.md).

## License

[MIT](LICENSE). API access remains subject to your service agreement.
