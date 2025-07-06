#!/usr/bin/env node
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, '..');
const PROFILE = path.join(__dirname, '.pw-profile');

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
    let extId = null;
    for (let i = 0; i < 20; i++) {
      const sw = context.serviceWorkers().find((w) => w.url().includes('chrome-extension://'));
      if (sw) {
        extId = new URL(sw.url()).host;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!extId) throw new Error('Extension service worker not found');

    const page = await context.newPage();
    await page.goto(`chrome-extension://${extId}/bench/benchmark.html?mode=storage-only`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await page.locator('#out[data-done="1"]').waitFor({ timeout: 60000 });
    const text = await page.locator('#out').textContent();
    const data = JSON.parse(text);
    console.log(JSON.stringify(data.storage, null, 2));
  } finally {
    await context.close();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: String(e), stack: e.stack }));
  process.exit(1);
});
