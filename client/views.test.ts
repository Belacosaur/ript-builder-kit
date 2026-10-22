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
test('public Ript card archive artwork is allowed without trusting unrelated R2 hosts',()=>{
 const url='https://pub-539ad16e2f8b4637ac2b6f2d440c7605.r2.dev/archives/pokemon/en/v1/sets/prismatic-evolutions/cards/144-leafeon-ex/images/small.png';
 assert.equal(imageUrl(url),url);assert.equal(imageUrl('https://pub-untrusted.r2.dev/card.png'),undefined);
});
