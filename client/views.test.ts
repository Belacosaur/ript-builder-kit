import { test } from "node:test";
import assert from "node:assert/strict";
import { imageUrl } from "./views/common.js";
test("artwork accepts published origins and rejects private or executable sources", () => {
  assert.equal(
    imageUrl("/riptpacks/RiptWhite.png"),
    "https://ript.fun/riptpacks/RiptWhite.png",
  );
  assert.equal(imageUrl("javascript:alert(1)"), undefined);
  assert.equal(imageUrl("https://untrusted.example/card.png"), undefined);
});
