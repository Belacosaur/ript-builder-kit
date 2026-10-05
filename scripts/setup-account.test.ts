import { test } from "node:test";
import assert from "node:assert/strict";
import { setupAccount } from "./setup-account.js";
test("occupied email never changes existing account or writes credentials", async () => {
  let saves = 0;
  let calls = 0;
  await assert.rejects(
    () =>
      setupAccount(
        {
          email: "builder@example.com",
          displayName: "Client Lab",
          baseUrl: "https://ript-backend-production.up.railway.app",
        },
        {
          read: () => undefined,
          write: (name) => {
            if (name !== "registration-attempt") saves++;
          },
        },
        async (path) => {
          calls++;
          assert.equal(path, "/auth/email/register");
          return { status: 409, data: { error: "email_in_use" } };
        },
      ),
    /email_in_use/,
  );
  assert.equal(saves, 0);
  assert.equal(calls, 1);
});
test("pending application resumes without duplicate registration or key issuance", async () => {
  const saved: any = {
    account: {
      userId: "user",
      sessionToken: "session-private",
      password: "password-private",
    },
    credentials: {},
  };
  let writes = 0;
  const paths: string[] = [];
  const result = await setupAccount(
    {
      email: "builder@example.com",
      displayName: "Client Lab",
      baseUrl: "https://ript-backend-production.up.railway.app",
    },
    {
      read: (name) => saved[name],
      write: (name, value) => {
        saved[name] = value;
        writes++;
      },
    },
    async (path) => {
      paths.push(path);
      return {
        status: 200,
        data: {
          partner: {
            id: path.includes("sandbox") ? "sandbox-id" : "live-id",
            status: "pending",
            approvedAt: null,
          },
        },
      };
    },
  );
  assert.deepEqual(paths, [
    "/program/me?environment=sandbox",
    "/program/me?environment=live",
  ]);
  assert.ok(!JSON.stringify(result).includes("private"));
  assert.equal(result.environments.sandbox.status, "pending");
  assert.equal(writes, 0);
});
test("approved partners get separate keys and replay never rotates them", async () => {
  const saved: any = {
    account: { userId: "user", sessionToken: "private" },
    credentials: {},
  };
  let issued = 0;
  const api = async (path: string) => {
    const env = path.includes("sandbox") ? "sandbox" : "live";
    if (path.includes("credentials")) {
      issued++;
      return {
        status: 200,
        data: { id: env + "-key", token: "ript_gacha_" + env + "_private" },
      };
    }
    return {
      status: 200,
      data: {
        partner: { id: env + "-partner", status: "active", approvedAt: "now" },
      },
    };
  };
  const store = {
    read: (name: string) => saved[name],
    write: (name: string, value: unknown) => {
      saved[name] = value;
    },
  };
  await setupAccount(
    {
      email: "a@b.test",
      displayName: "Lab",
      baseUrl: "https://ript-backend-production.up.railway.app",
    },
    store,
    api,
  );
  const result = await setupAccount(
    {
      email: "a@b.test",
      displayName: "Lab",
      baseUrl: "https://ript-backend-production.up.railway.app",
    },
    store,
    api,
  );
  assert.equal(issued, 2);
  assert.equal(saved.credentials.sandbox.key, "ript_gacha_sandbox_private");
  assert.equal(saved.credentials.live.key, "ript_gacha_live_private");
  assert.ok(!JSON.stringify(result).includes("_private"));
});
test("lost registration response retains password and resumes via legitimate login", async () => {
  const saved: any = {};
  let password = "";
  const store = {
    read: (n: string) => saved[n],
    write: (n: string, v: any) => {
      saved[n] = v;
    },
  };
  const options = {
    email: "new@b.test",
    displayName: "Lab",
    baseUrl: "https://ript-backend-production.up.railway.app",
  };
  await assert.rejects(() =>
    setupAccount(options, store, async (path, body: any) => {
      assert.equal(path, "/auth/email/register");
      password = body.password;
      assert.equal(saved["registration-attempt"].password, password);
      throw new Error("response_lost");
    }),
  );
  const paths: string[] = [];
  await setupAccount(options, store, async (path, body: any) => {
    paths.push(path);
    if (path === "/auth/email/login") {
      assert.equal(body.password, password);
      return {
        status: 200,
        data: { user: { id: "u" }, sessionToken: "private" },
      };
    }
    return { status: 200, data: { partner: { id: "p", status: "pending" } } };
  });
  assert.equal(paths[0], "/auth/email/login");
  assert.equal(saved.account.password, password);
});
