import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/**
 * Start the production server Nuxt just built, then prove server rendering and hydration.
 *
 * The markup must already carry the decoded query, and the client bundle must carry the QueryWeave
 * runtime so the same state survives hydration.
 */

const port = 41_837;
const origin = `http://127.0.0.1:${String(port)}`;

const server = spawn(process.execPath, [join(".output", "server", "index.mjs")], {
  env: { ...process.env, NITRO_PORT: String(port), PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"],
});

let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += String(chunk);
});
server.stderr.on("data", (chunk) => {
  serverOutput += String(chunk);
});

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) {
        return;
      }
    } catch {
      // The server is still starting.
    }
    await delay(200);
  }
  throw new Error(`the Nuxt server never became ready:\n${serverOutput}`);
}

async function render(path) {
  const response = await fetch(`${origin}${path}`);
  assert.equal(response.ok, true, `${path} did not render`);
  return response.text();
}

async function stopServer() {
  if (server.exitCode !== null) {
    return;
  }
  const exited = new Promise((resolve) => {
    server.once("exit", resolve);
  });
  server.kill();
  await Promise.race([exited, delay(5000)]);
}

try {
  await waitForServer();

  const rendered = await render("/?page=4&search=vue");
  assert.match(rendered, /page:4/u, "the server render must carry the decoded page");
  assert.match(rendered, /search:vue/u, "the server render must carry the decoded search");
  assert.match(rendered, /status:valid/u);
  assert.doesNotMatch(rendered, /page:1</u, "the default must not win over the request");

  const defaults = await render("/");
  assert.match(defaults, /page:1/u, "a request without a query falls back to declared defaults");
  assert.match(defaults, /search:none/u);

  const [withQuery, withoutQuery] = await Promise.all([render("/?page=9"), render("/")]);
  assert.match(withQuery, /page:9/u, "concurrent requests must not share state");
  assert.match(withoutQuery, /page:1/u, "concurrent requests must not share state");

  assert.match(rendered, /<div id="__nuxt">/u, "the hydration root must be present");
  assert.match(rendered, /id="__NUXT_DATA__"/u, "the hydration payload must be present");
  assert.match(rendered, /data-ssr="true"/u, "the response must be server rendered");

  const clientDirectory = join(".output", "public", "_nuxt");
  const clientFiles = (await readdir(clientDirectory)).filter((file) => file.endsWith(".js"));
  assert.ok(clientFiles.length > 0, "a client bundle must exist");

  const bundles = await Promise.all(
    clientFiles.map(async (file) => readFile(join(clientDirectory, file), "utf8")),
  );
  assert.ok(
    bundles.some((bundle) => bundle.includes("must be an integer")),
    "the client bundle must carry the QueryWeave codecs used during hydration",
  );
} finally {
  await stopServer();
}

console.log("nuxt consumer ok");
