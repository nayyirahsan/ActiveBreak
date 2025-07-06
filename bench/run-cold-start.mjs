#!/usr/bin/env node
// Cold-start model load: fresh Chrome profile, single iteration (WASM compile + model init).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5174;
const PROFILE = path.join(__dirname, '.chrome-cold-profile');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.wasm': 'application/wasm', '.task': 'application/octet-stream'
};

function serve(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let filePath = path.join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/') filePath = path.join(ROOT, 'bench/benchmark.html');
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const server = http.createServer(serve);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    userDataDir: PROFILE,
    args: ['--no-sandbox', '--no-first-run']
  });

  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${PORT}/bench/benchmark.html?mode=browser-only`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });
    await page.waitForFunction(() => document.getElementById('out')?.dataset.done === '1', { timeout: 120000 });
    const data = JSON.parse(await page.$eval('#out', (el) => el.textContent));
    const cold = data.modelLoad;
    console.log(JSON.stringify({
      coldStart: {
        delegate: cold.delegate,
        wasmLoadMs: cold.wasmLoadMs.samples[0],
        modelInitMs: cold.modelInitMs.samples[0],
        totalLoadMs: cold.totalLoadMs.samples[0]
      }
    }, null, 2));
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
