import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
type Store = {
  read: (name: string) => any;
  write: (name: string, value: unknown) => void;
};
type Api = (
  path: string,
  body?: unknown,
  session?: string,
) => Promise<{ status: number; data: any }>;
type Options = { email: string; displayName: string; baseUrl: string };
export async function setupAccount(options: Options, store: Store, api: Api) {
  let account = store.read("account");
  const credentials = store.read("credentials") ?? {};
  if (!account) {
    let attempt = store.read("registration-attempt");
    const recovering =
      attempt?.email === options.email && attempt.state === "uncertain";
    if (attempt?.email === options.email && attempt.state === "conflict")
      throw new Error("email_in_use: existing account preserved");
    if (attempt?.state === "uncertain" && attempt.email !== options.email)
      throw new Error("unresolved_registration_for_other_email");
    if (!recovering) {
      attempt = {
        email: options.email,
        password: "Lab!" + randomBytes(28).toString("base64url"),
        state: "uncertain",
      };
      store.write("registration-attempt", attempt);
    }
    const password = attempt.password;
    let result;
    if (recovering) {
      result = await api("/auth/email/login", {
        email: options.email,
        password,
      });
      if (result.status !== 200 && result.status !== 401)
        throw new Error(
          "registration_reconciliation_unavailable_" + result.status,
        );
    }
    if (!result || result.status === 401)
      result = await api("/auth/email/register", {
        email: options.email,
        password,
        displayName: options.displayName,
      });
    if (result.status === 409) {
      store.write("registration-attempt", { ...attempt, state: "conflict" });
      throw new Error(
        "email_in_use: existing account preserved; provide legitimate access or a distinct alias",
      );
    }
    if (
      result.status >= 400 ||
      !result.data.sessionToken ||
      !result.data.user?.id
    )
      throw new Error("registration_failed_" + result.status);
    account = {
      email: options.email,
      password,
      userId: result.data.user.id,
      sessionToken: result.data.sessionToken,
      createdAt: new Date().toISOString(),
    };
    store.write("account", account);
    store.write("registration-attempt", {
      email: options.email,
      state: "complete",
    });
  }
  const receipt: any = {
    email: options.email,
    userId: account.userId,
    environments: {},
  };
  for (const environment of ["sandbox", "live"] as const) {
    let response = await api(
      "/program/me?environment=" + environment,
      undefined,
      account.sessionToken,
    );
    if (response.status >= 400)
      throw new Error("portal_read_failed_" + response.status);
    let partner = response.data.partner;
    if (!partner) {
      const application = await api(
        "/program/apply",
        {
          environment,
          door: "direct",
          name: "Gacha Client Lab",
          slug: "gacha-client-lab-" + String(account.userId).slice(0, 8),
          pitch:
            "Independent third-party integration testing across all direct Gacha APIs.",
          contactEmail: options.email,
        },
        account.sessionToken,
      );
      if (application.status >= 400)
        throw new Error("application_failed_" + application.status);
      response = await api(
        "/program/me?environment=" + environment,
        undefined,
        account.sessionToken,
      );
      if (response.status >= 400)
        throw new Error("portal_read_failed_" + response.status);
      partner = response.data.partner;
    }
    if (!partner) throw new Error("missing_partner_after_application");
    if (
      partner.approvedAt &&
      ["active", "paused"].includes(partner.status) &&
      !credentials[environment]
    ) {
      const issued = await api(
        "/program/me/credentials?environment=" + environment,
        { label: "Gacha Client Lab standalone" },
        account.sessionToken,
      );
      if (
        issued.status >= 400 ||
        !issued.data.token?.startsWith("ript_gacha_" + environment + "_")
      )
        throw new Error("credential_failed_" + issued.status);
      credentials[environment] = {
        partnerId: partner.id,
        id: issued.data.id,
        key: issued.data.token,
      };
      store.write("credentials", credentials);
    }
    receipt.environments[environment] = {
      partnerId: partner.id,
      status: partner.status,
      approved: !!partner.approvedAt,
      credentialId: credentials[environment]?.id ?? null,
      keyHint: credentials[environment]
        ? "ript_gacha_" + environment + "_…"
        : null,
    };
  }
  return receipt;
}
export function privateStore(): Store {
  mkdirSync(".private", { recursive: true });
  return {
    read: (name) => {
      const path = ".private/" + name + ".json";
      return existsSync(path)
        ? JSON.parse(readFileSync(path, "utf8"))
        : undefined;
    },
    write: (name, value) => {
      const path = ".private/" + name + ".json";
      writeFileSync(path + ".tmp", JSON.stringify(value, null, 2), {
        mode: 0o600,
      });
      renameSync(path + ".tmp", path);
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const baseUrl = "https://ript-backend-production.up.railway.app";
  const email = process.env.DEVELOPER_EMAIL?.trim();
  if (!email) throw new Error("Set DEVELOPER_EMAIL to your own address before account setup");
  const store = privateStore();
  const api: Api = async (path, body, session) => {
    const response = await fetch(baseUrl + path, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        ...(session ? { authorization: "Bearer " + session } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    const receipt = await setupAccount(
      {
        email,
        displayName: process.env.DEVELOPER_DISPLAY_NAME ?? "Ript Builder",
        baseUrl,
      },
      store,
      api,
    );
    writeFileSync(
      "docs/account-receipt.json",
      JSON.stringify(receipt, null, 2),
    );
    console.log(JSON.stringify(receipt, null, 2));
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "account_setup_failed",
    );
    process.exitCode = 1;
  }
}
