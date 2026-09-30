import { test } from "node:test";
import assert from "node:assert/strict";
import { getProject } from "../src/lib/server/project";
import { POST } from "../src/app/api/build/route";

test("accepts the public Host origin when Next binds to 0.0.0.0", async () => {
  const response = await POST(
    new Request("http://0.0.0.0:3000/api/build", {
      method: "POST",
      headers: {
        host: "localhost:3000",
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ revision: (await getProject()).revision, values: {} }),
    }),
  );
  assert.equal(response.status, 400); // Configuration error, not a false cross-origin rejection.
  assert.match((await response.json() as { error: string }).error, /hardware/);
});
test("rejects cross-origin, non-JSON, oversized and malformed requests", async () => {
  const request = (body: string, headers: Record<string, string>) =>
    new Request("http://localhost:3000/api/build", {
      method: "POST",
      body,
      headers,
    });
  assert.equal(
    (
      await POST(
        request("{}", {
          host: "localhost:3000",
          origin: "https://elsewhere.example",
          "content-type": "application/json",
        }),
      )
    ).status,
    403,
  );
  assert.equal(
    (await POST(request("{}", { "content-type": "text/plain" }))).status,
    415,
  );
  assert.equal(
    (
      await POST(
        request(" ".repeat(16385), { "content-type": "application/json" }),
      )
    ).status,
    413,
  );
  assert.equal(
    (await POST(request("{", { "content-type": "application/json" }))).status,
    400,
  );
});


test("builds reject missing, arbitrary, and unavailable source revisions", async () => {
  for (const [payload, status] of [
    [{ values: {} }, 400],
    [{ values: {}, revision: "../../other" }, 400],
    [{ values: {}, revision: "f".repeat(40) }, 409],
  ] as const) {
    const response = await POST(new Request("http://localhost:3000/api/build", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    }));
    assert.equal(response.status, status);
  }
});
