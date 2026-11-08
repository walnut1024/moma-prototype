#!/usr/bin/env node
import { copyFileSync, cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {modelWorkerDataPlugin} from "./model-worker-build.mjs";

import { API_PREFIX } from "../versions/moma_5.12.0_estack/api-path.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const client = path.join(dist, "client");
const index = path.join(root, "index.html");
const publicDir = path.join(root, "public");
const worker = path.join(root, "worker", "index.js");
const hosting = path.join(root, ".openai", "hosting.json");

for (const file of [index, worker, hosting]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

// Rebuild dist/client from scratch so retired versions cannot linger from earlier builds.
rmSync(client, { recursive: true, force: true });
mkdirSync(client, { recursive: true });
mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });
copyFileSync(index, path.join(client, "index.html"));
cpSync(publicDir, client, { recursive: true });
await build({ entryPoints: [worker], outfile: path.join(dist, 'server', 'index.js'), plugins:[modelWorkerDataPlugin], bundle: true, minify: true, format: 'esm', platform: 'browser', target: 'es2022' });
copyFileSync(path.join(dist, 'server', 'index.js'), path.join(client, '_worker.js'));
writeFileSync(path.join(client,'_routes.json'),JSON.stringify({version:1,include:[API_PREFIX,API_PREFIX+'/*'],exclude:[]}));
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));

console.log("Prepared Sites build: dist/client, dist/server/index.js and dist/.openai/hosting.json");
