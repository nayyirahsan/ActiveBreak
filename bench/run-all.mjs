#!/usr/bin/env node
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, '..');
const PROFILE = path.join(__dirname, '.pw-profile');

function runNode(script) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [script], { cwd: __dirname });
    let out = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { out += d; });
    proc.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(out))));
  });
}

async function getExtId(context) {
  for (let i = 0; i < 20; i++) {
    const sw = context.serviceWorkers().find((w) => w.url().includes('chrome-extension://'));
    if (sw) return new URL(sw.url()).host;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Extension service worker not found');
}

async function runExtensionBench(context, extId, mode) {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extId}/bench/benchmark.html?mode=${mode}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120000
  });
  await page.locator('#out[data-done="1"]').waitFor({ timeout: 120000 });
  const text = await page.locator('#out').textContent();
  await page.close();
  return JSON.parse(text);
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const context = await chromium.launchPersistentContext(PROFILE, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`
    ]
  });

  try {
    const extId = await getExtId(context);
    const browserOnly = await runExtensionBench(context, extId, 'browser-only');
    const storageOnly = await runExtensionBench(context, extId, 'storage-only');
    const accOut = await runNode('accuracy-bench.mjs');
    const accuracy = JSON.parse(accOut);

    const report = {
      environment: {
        platform: process.platform,
        node: process.version,
        measuredAt: new Date().toISOString(),
        note: 'Model/inference measured in extension page (MV3 CSP). Storage = background write → page onChanged.'
      },
      modelLoad: browserOnly.modelLoad,
      inference: browserOnly.inference,
      storage: storageOnly.storage,
      accuracy
    };

    fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: String(e), stack: e.stack }));
  process.exit(1);
});
