#!/usr/bin/env node
// Measures chrome.storage.local write → onChanged latency inside the extension.

import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PROFILE = path.join(__dirname, '.chrome-profile');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readExtensionId(profileDir) {
  const prefPath = path.join(profileDir, 'Default', 'Preferences');
  if (!fs.existsSync(prefPath)) return null;
  const prefs = JSON.parse(fs.readFileSync(prefPath, 'utf8'));
  const settings = prefs.extensions?.settings || {};
  for (const [id, meta] of Object.entries(settings)) {
    if (meta.path === EXT_DIR || meta.path?.includes('ActiveBreak')) return id;
  }
  for (const [id, meta] of Object.entries(settings)) {
    if (meta.manifest?.name?.includes('ActiveBreak')) return id;
  }
  return Object.keys(settings)[0] || null;
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    userDataDir: PROFILE,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });

  try {
    await sleep(4000);
    let extId = readExtensionId(PROFILE);
    if (!extId) {
      const targets = await browser.targets();
      const hit = targets.find((t) => t.url().startsWith('chrome-extension://'));
      if (hit) extId = new URL(hit.url()).host;
    }
    if (!extId) throw new Error('Could not resolve extension id');

    const page = await browser.newPage();
    await page.goto(`chrome-extension://${extId}/bench/benchmark.html?mode=storage-only`, {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await page.waitForFunction(
      () => document.getElementById('out')?.dataset.done === '1',
      { timeout: 60000 }
    );
    const text = await page.$eval('#out', (el) => el.textContent);
    const data = JSON.parse(text);
    console.log(JSON.stringify(data.storage, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err), stack: err.stack }));
  process.exit(1);
});
