import { resolve } from "node:path";
import { existsSync } from "node:fs";
import staticPlugin from "@fastify/static";
import { createApp } from "./proxy.js";
import { loadConfig } from "./config.js";
const config = loadConfig();
const app = createApp(config);
if (existsSync("dist/index.html"))
  await app.register(staticPlugin, { root: resolve("dist") });
else
  app.get("/", async (_req, reply) =>
    reply
      .type("text/plain")
      .send("Run npm run build, then restart the server."),
  );
await app.listen({ host: "127.0.0.1", port: config.port });
console.log("Gacha Client Lab: http://127.0.0.1:" + config.port);
