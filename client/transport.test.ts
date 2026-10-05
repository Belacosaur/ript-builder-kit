import { test } from "node:test";
import assert from "node:assert/strict";
import { requestJson } from "./transport.js";
import { ApiError } from "../shared/errors.js";
const context = {
  scope: {
    environment: "sandbox" as const,
    partnerId: "p",
    wallet: "w",
    chain: "c",
  },
  mutation: true,
};
test("transport preserves retry-after and status without leaking response secrets", async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({ error: "opening_preparing", secret: "private" }),
        { status: 429, headers: { "retry-after": "2" } },
      );
    await assert.rejects(
      requestJson("/api/gacha/create", {}, context),
      (e: any) =>
        e instanceof ApiError &&
        e.status === 429 &&
        e.retryAfterMs === 2000 &&
        !e.message.includes("private"),
    );
    globalThis.fetch = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(
      requestJson("/api/gacha/create", {}, context),
      (e: any) => e.code === "transport_uncertain" && e.uncertain,
    );
    globalThis.fetch = async () =>
      new Response('{"error":"unauthorized"}', { status: 401 });
    await assert.rejects(
      requestJson("/api/gacha/create", {}, context),
      (e: any) => !e.retryable,
    );
  } finally {
    globalThis.fetch = old;
  }
});

test("malformed unauthorized response stays nonretryable", async () => {
  const old = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response("not json", { status: 401 });
    await assert.rejects(
      requestJson("/api/gacha/create", {}, context),
      (e: any) => e.status === 401 && !e.retryable && !e.uncertain,
    );
  } finally {
    globalThis.fetch = old;
  }
});
