import { test } from "node:test";
import assert from "node:assert/strict";
import { operationDefinitions } from "./operations.js";
test("all ten direct and four testing operations have exact routes and examples", () => {
  assert.equal(operationDefinitions.length, 14);
  for (const op of operationDefinitions) {
    assert.ok(op.pathTemplate.startsWith("/"));
    assert.ok(op.docs);
    assert.ok(op.example);
  }
});
