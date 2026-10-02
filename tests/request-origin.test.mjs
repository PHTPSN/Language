import test from "node:test";
import assert from "node:assert/strict";
import { hasSameRequestOrigin } from "../lib/request-origin.ts";

const request = (target, origin, host, extra = {}) => new Request(target, {
  method: "POST",
  headers: { ...(origin === undefined ? {} : { origin }), ...(host ? { host } : {}), ...extra },
});

test("matching local and hosted origins are accepted", () => {
  assert.equal(hasSameRequestOrigin(request("http://localhost:5173/api/learner", "http://localhost:5173")), true);
  assert.equal(hasSameRequestOrigin(request("https://language.example/api/learner", "https://language.example")), true);
});

test("Next loopback normalization accepts the actual browser host", () => {
  assert.equal(hasSameRequestOrigin(request("http://localhost:5173/api/learner", "http://127.0.0.1:5173", "127.0.0.1:5173")), true);
  assert.equal(hasSameRequestOrigin(request("http://127.0.0.1:5173/api/learner", "http://localhost:5173", "localhost:5173")), true);
  assert.equal(hasSameRequestOrigin(request("http://localhost:5173/api/learner", "http://[::1]:5173", "[::1]:5173")), true);
});

test("loopback exceptions require the same port, scheme and Host", () => {
  assert.equal(hasSameRequestOrigin(request("http://localhost:5173/api/learner", "http://127.0.0.1:5174", "127.0.0.1:5174")), false);
  assert.equal(hasSameRequestOrigin(request("http://localhost:5173/api/learner", "https://127.0.0.1:5173", "127.0.0.1:5173")), false);
  assert.equal(hasSameRequestOrigin(request("http://localhost:5173/api/learner", "http://127.0.0.1:5173", "localhost:5173")), false);
});

test("external origins and forged forwarded hosts remain rejected", () => {
  for (const origin of ["https://unrelated.example", "http://localhost.unrelated.example:5173"]) {
    assert.equal(hasSameRequestOrigin(request("http://localhost:5173/api/learner", origin, "localhost:5173")), false);
  }
  assert.equal(hasSameRequestOrigin(request("https://language.example/api/learner", "http://localhost:5173", "localhost:5173", { "x-forwarded-host": "localhost:5173" })), false);
  assert.equal(hasSameRequestOrigin(request("https://language.example/api/learner", "https://unrelated.example", "language.example", { "x-forwarded-host": "unrelated.example" })), false);
});

test("opaque or malformed Origin values cannot bypass validation", () => {
  for (const origin of ["null", "", "http://localhost:5173/path", "http://name:password@localhost:5173", "not-an-origin"]) {
    assert.equal(hasSameRequestOrigin(request("http://localhost:5173/api/learner", origin, "localhost:5173")), false);
  }
  assert.equal(hasSameRequestOrigin(request("http://localhost:5173/api/learner", undefined)), true);
});
