import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
export function clientBuild(root = process.cwd()) {
  const hash = createHash("sha256");
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const p = dir + "/" + entry.name;
      if (entry.isDirectory()) walk(p);
      else if (
        (p.endsWith(".ts") && !p.endsWith(".test.ts")) ||
        p.endsWith(".css")
      )
        files.push(p);
    }
  }
  for (const dir of ["client", "shared", "server", "packages/sdk/src"]) walk(dir);
  files.push("package.json", "package-lock.json", "vite.config.ts");
  for (const path of files.sort()) {
    hash.update(path);
    hash.update(readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n"));
  }
  return (
    JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version +
    "+" +
    hash.digest("hex").slice(0, 16)
  );
}
