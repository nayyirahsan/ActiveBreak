#!/usr/bin/env node
// Launches Chrome with the ActiveBreak extension loaded and runs browser benchmarks.

import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BENCH_URL_PATH = 'bench/benchmark.html';
const TIMEOUT_MS = 120_000;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getExtensionId(browser) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const targets = await browser.targets();
    const ext = targets.find((t) => t.url().startsWith('chrome-extension://'));
    if (ext) return new URL(ext.url()).host;
    await sleep(500);
  }

  const page = await browser.newPage();
  await page.goto('chrome://extensions', { waitUntil: 'domcontentloaded' });
  const extId = await page.evaluate(() => {
    const mgr = document.querySelector('extensions-manager');
    const toolbar = mgr?.shadowRoot?.querySelector('extensions-toolbar');
    const devToggle = toolbar?.shadowRoot?.querySelector('#devMode');
    if (devToggle && !devToggle.checked) devToggle.click();

    const items = mgr?.shadowRoot?.querySelectorAll('extensions-item') || [];
    for (const item of items) {
      const name = item.shadowRoot?.querySelector('#name')?.textContent?.trim() || '';
      if (name.includes('ActiveBreak')) {
        return item.getAttribute('id');
      }
    }
    return items[0]?.getAttribute('id') || null;
  });
  await page.close();
  if (extId) return extId;

  const urls = (await browser.targets()).map((t) => `${t.type()}:${t.url()}`);
  throw new Error(`Extension not found. Targets: ${urls.join(' | ')}`);
}

async function main() {
  if (!fs.existsSync(CHROME)) {
    console.error(JSON.stringify({ error: `Chrome not found at ${CHROME}` }));
    process.exit(1);
  }

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_DIR}`,
      `--load-extension=${EXT_DIR}`,
      `--user-data-dir=${path.join(__dirname, '.chrome-profile')}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ],
    defaultViewport: { width: 900, height: 700 }
  });

  try {
    await sleep(2000);
    const extId = await getExtensionId(browser);
    const benchUrl = `chrome-extension://${extId}/${BENCH_URL_PATH}`;

    const page = await browser.newPage();
    await page.goto(benchUrl, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS });

    await page.waitForFunction(
      () => document.getElementById('out')?.dataset.done === '1',
      { timeout: TIMEOUT_MS }
    );

    const text = await page.$eval('#out', (el) => el.textContent);
    const browserResults = JSON.parse(text);

  // Also run synthetic accuracy bench
    const accProc = spawn('node', ['accuracy-bench.mjs'], { cwd: __dirname });
    const accOut = await new Promise((resolve, reject) => {
      let buf = '';
      accProc.stdout.on('data', (d) => { buf += d; });
      accProc.stderr.on('data', (d) => { buf += d; });
      accProc.on('close', (code) => (code === 0 ? resolve(buf) : reject(new Error(buf))));
    });
    const accuracyResults = JSON.parse(accOut);

    const report = {
      environment: {
        chrome: CHROME,
        extensionDir: EXT_DIR,
        platform: process.platform,
        node: process.version
      },
      browser: browserResults,
      accuracy: accuracyResults
    };

    const outPath = path.join(__dirname, 'results.json');
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err), stack: err.stack }, null, 2));
  process.exit(1);
});
