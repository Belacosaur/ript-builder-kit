# Builder guidance

Read README.md, llms.txt and docs/builders/ai-instructions.md before changing integrations. Use the supported operations in docs/openapi.json; do not invent backend routes or response fields.

Run npm ci and npm test. Regenerate contracts with npm run build:openapi after contract changes. Pack the SDK with npm run build:sdk and npm pack ./packages/sdk.

Keep credentials and owner operations on the server. Preserve fixed proxy routes, exact string amounts, durable financial identities, scoped state and explicit signing consent. Unknown observations remain unknown. Never present fixture success as deployed acceptance.

Do not commit .env, .private, generated account receipts, signed transaction bytes, local evidence or screenshots containing account data. The Ript backend is outside this repository.
