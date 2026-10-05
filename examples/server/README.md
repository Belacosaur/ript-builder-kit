# Independent treasury server and dashboard

Requires Node 22+. These folders work outside the Ript application checkout. The SDK is currently a local release artifact, not an npm publication.

1. Copy `examples/server` and its sibling `examples/dashboard` into a new directory.
2. Copy the packed `ript-sdk-0.1.0.tgz` into `server`; run `npm install --ignore-scripts ./ript-sdk-0.1.0.tgz` there.
3. Copy `.env.example` to `.env`; set your own HTTPS API origin, explicit environment and matching partner Gacha key. No project ID is compiled into the example.
4. Run `npm start`, then open the printed localhost URL.

This server serves the packed browser SDK directly through an import map; no framework or bundler is needed. The two proxy endpoints are fixed treasury reads. It binds to localhost and checks browser origins. Before hosting remotely, add user authentication and authorization; your partner API key is not a substitute for dashboard user permissions. Keep `.env` private. Treasury endpoints must be deployed on your API before this example can read them; local implementation does not establish deployment.

Owner management is deliberately separate: use a server SDK with `credentials.partnerSession` in your own authenticated owner workflow. Never supply this credential to the browser. Funding preparation returns an unsigned transaction for wallet review; it does not transfer funds automatically.
