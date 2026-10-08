import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
const calls = [];
let exists = false;
const mock = createServer(async (req, res) => {
  let text = "";
  for await (const chunk of req) text += chunk;
  calls.push({
    path: req.url,
    method: req.method,
    body: text ? JSON.parse(text) : null,
  });
  res.setHeader("content-type", "application/json");
  if (req.url === "/auth/v1/admin/users" && req.method === "POST") {
    if (exists) {
      res.writeHead(422);
      res.end(
        JSON.stringify({
          code: "email_exists",
          msg: "An account with that email already exists.",
        }),
      );
    } else {
      exists = true;
      res.end(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000001",
          email: "registration@example.invalid",
          email_confirmed_at: new Date().toISOString(),
          app_metadata: { provider: "email" },
          user_metadata: { name: "Registration QA" },
          created_at: new Date().toISOString(),
        }),
      );
    }
  } else {
    res.writeHead(429);
    res.end(JSON.stringify({ msg: "email rate limit exceeded" }));
  }
});
await new Promise((resolve) => mock.listen(0, "127.0.0.1", resolve));
const origin = "http://127.0.0.1:3106";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3106",
  ],
  {
    env: {
      ...process.env,
      VERCEL: "1",
      NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mock.address().port}`,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public",
      SUPABASE_SERVICE_ROLE_KEY: "test-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let logs = "";
child.stdout.on("data", (b) => (logs += b));
child.stderr.on("data", (b) => (logs += b));
async function register(extra = {}, requestOrigin = origin) {
  return fetch(origin + "/api/session", {
    method: "POST",
    headers: { Origin: requestOrigin, "content-type": "application/json" },
    body: JSON.stringify({
      register: true,
      email: "registration@example.invalid",
      password: "Registration-QA-123!",
      name: "Registration QA",
      ...extra,
    }),
  });
}
try {
  for (let i = 0; i < 80; i++) {
    if (child.exitCode !== null) throw Error(logs);
    try {
      if ((await fetch(origin)).status === 200) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  const rejected = await register({}, "https://untrusted.example");
  assert.equal(rejected.status, 400);
  assert.equal(calls.length, 0);
  const missing = await register({ name: "" });
  assert.equal(missing.status, 400);
  assert.equal(calls.length, 0);
  const response = await register();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("set-cookie"), null);
  const result = await response.json();
  assert.match(result.message, /No email confirmation is needed/);
  assert.match(result.message, /administrator/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].path, "/auth/v1/admin/users");
  assert.equal(calls[0].body.email_confirm, true);
  assert.deepEqual(calls[0].body.user_metadata, { name: "Registration QA" });
  assert.equal(calls[0].body.app_metadata, undefined);
  const duplicate = await register();
  assert.equal(duplicate.status, 400);
  assert.match((await duplicate.json()).error, /already exists/);
  assert.equal(calls.length, 2);
  console.log(
    "PASS cloud registration sends no email, issues no session, preserves approval message, rejects cross-origin and duplicate accounts",
  );
} finally {
  child.kill();
  await new Promise((resolve) =>
    child.exitCode !== null ? resolve() : child.once("exit", resolve),
  );
  await new Promise((resolve) => mock.close(resolve));
}
