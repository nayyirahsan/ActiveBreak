#!/usr/bin/env node
// Serves bench/benchmark.html over HTTP so MediaPipe WASM can load without extension CSP.
// Model-load + inference FPS only (no chrome.storage APIs).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5173;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.json': 'application/json'
};

function serve(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let filePath = path.join(ROOT, decodeURIComponent(url.pathname));
  if (url.pathname === '/') filePath = path.join(ROOT, 'bench/benchmark.html');
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

async function main() {
  const server = http.createServer(serve);
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: false,
    args: [
      '--no-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream'
    ]
  });

  try {
    const page = await browser.newPage();
    page.on('console', (msg) => console.error('[page]', msg.type(), msg.text()));
    page.on('pageerror', (err) => console.error('[pageerror]', err.message));
    await page.goto(`http://127.0.0.1:${PORT}/bench/benchmark.html?mode=browser-only`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000
    });
    try {
      await page.waitForFunction(
        () => document.getElementById('out')?.dataset.done === '1',
        { timeout: 120000 }
      );
    } catch {
      const text = await page.$eval('#out', (el) => el.textContent).catch(() => '(no #out)');
      throw new Error(`Benchmark did not finish. Output: ${text}`);
    }
    const text = await page.$eval('#out', (el) => el.textContent);
    console.log(text);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err), stack: err.stack }));
  process.exit(1);
});
