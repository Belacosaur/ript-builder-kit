import { test } from "node:test";
import assert from "node:assert/strict";
import { retry } from "./retry.js";
import { ApiError } from "../shared/errors.js";
test("retry bounds elapsed time and honours retry-after", async () => {
  let time = 0,
    calls = 0;
  const waits: number[] = [];
  const value = await retry(
    async () => {
      calls++;
      time += 100;
      if (calls < 3)
        throw new ApiError("opening_preparing", 409, true, false, 1200);
      return 7;
    },
    {
      deadline: 4000,
      signal: new AbortController().signal,
      check() {},
      now: () => time,
      sleep: async (ms) => {
        waits.push(ms);
        time += ms;
      },
      random: () => 0.5,
    },
  );
  assert.equal(value, 7);
  assert.deepEqual(waits, [1200, 1200]);
});
test("abort and exhausted deadline prevent additional work", async () => {
  const ac = new AbortController();
  ac.abort();
  let calls = 0;
  await assert.rejects(
    retry(async () => ++calls, {
      deadline: 100,
      signal: ac.signal,
      check() {},
      now: () => 0,
      sleep: async () => {},
      random: () => 0,
    }),
  );
  assert.equal(calls, 0);
});
