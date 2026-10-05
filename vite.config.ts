import { clientBuild } from "./server/build.js";
import { defineConfig } from "vite";
export default defineConfig({
  define: { __CLIENT_BUILD__: JSON.stringify(clientBuild()) },
  build: { target: "es2022" },
  server: { host: "127.0.0.1", proxy: { "/api": "http://127.0.0.1:4315" } },
});
