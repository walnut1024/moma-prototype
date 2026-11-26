import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import worker from "../worker/index.js";

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test('routes API v1 to the backend and never serves its failures as HTML', async () => {
  const env = { ASSETS: { fetch: () => { throw Error('API must not read assets'); } } };
  const missingBinding = await worker.fetch(new Request('https://example.test/api/v1/services'), env);
  assert.equal(missingBinding.status, 503);
  assert.equal((await missingBinding.json()).error.code, 'DATABASE_UNAVAILABLE');
  const unknown = await worker.fetch(new Request('https://example.test/api/v1/unknown', { headers: { accept: 'text/html' } }), env);
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error.code, 'NOT_FOUND');
});

test('answers the retired supplier-template URL with 410 without looking up static assets', async () => {
  const url = 'https://example.test/moma_5.12.0_estack/templates/supplier-offers.xlsx';
  const env = { ASSETS: { fetch: () => { throw Error('Retired template must not read assets'); } } };
  for (const request of [
    new Request(url),
    new Request(url, { method: 'HEAD' }),
    new Request(url + '?download=1', { headers: { Range: 'bytes=0-1023' } }),
  ]) {
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(await response.text(), '');
  }
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/5120/health", { headers: { accept: "text/html" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("uses the independent 5.12.0 shell for its nested routes", async () => {
  const calls = [];
  await worker.fetch(new Request('https://example.test/moma_5.12.0_estack/order/serviceOrder', {
    headers: { accept: 'text/html' },
  }), { ASSETS: { fetch: async request => {
    const pathname = new URL(request.url).pathname;
    calls.push(pathname);
    return new Response('', { status: calls.length === 1 ? 404 : 200 });
  } } });
  assert.deepEqual(calls, ['/moma_5.12.0_estack/order/serviceOrder', '/moma_5.12.0_estack/index.html']);
});

test("emits the files required by Sites packaging", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
  await access(new URL("../dist/server/index.js", import.meta.url));
  await access(new URL("../dist/.openai/hosting.json", import.meta.url));
});

test('routes only the retired template to the Worker and ships the shared model-material workbook', async () => {
  const routes = JSON.parse(await readFile(new URL('../dist/client/_routes.json', import.meta.url), 'utf8'));
  assert.deepEqual(routes, {
    version: 1,
    include: ['/api/v1', '/api/v1/*', '/moma_5.12.0_estack/templates/supplier-offers.xlsx'],
    exclude: [],
  });
  const assets = new URL('../dist/client/moma_5.12.0_estack/templates/', import.meta.url);
  await assert.rejects(access(new URL('supplier-offers.xlsx', assets)), { code: 'ENOENT' });
  const workbook = await readFile(new URL('model-material-import.xlsx', assets));
  assert.deepEqual(workbook.subarray(0, 4), Buffer.from([80, 75, 3, 4]));
});
