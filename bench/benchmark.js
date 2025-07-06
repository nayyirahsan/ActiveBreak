// Browser benchmarks: model load, inference FPS, chrome.storage sync latency.
import {
  FilesetResolver,
  PoseLandmarker
} from '../vendor/tasks-vision/vision_bundle.mjs';

const out = document.getElementById('out');
const video = document.getElementById('video');

function median(nums) {
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function p95(nums) {
  const s = [...nums].sort((a, b) => a - b);
  return s[Math.ceil(s.length * 0.95) - 1];
}

async function benchModelLoad(iterations = 3) {
  const wasmMs = [];
  const modelMs = [];
  let delegate = 'unknown';

  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const fileset = await FilesetResolver.forVisionTasks('../vendor/tasks-vision/wasm');
    wasmMs.push(performance.now() - t0);

    const options = (d) => ({
      baseOptions: {
        modelAssetPath: '../vendor/pose_landmarker_lite.task',
        delegate: d
      },
      runningMode: 'VIDEO',
      numPoses: 1
    });

    const t1 = performance.now();
    let landmarker;
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, options('GPU'));
      delegate = 'GPU';
    } catch {
      landmarker = await PoseLandmarker.createFromOptions(fileset, options('CPU'));
      delegate = 'CPU';
    }
    modelMs.push(performance.now() - t1);
    landmarker.close();
  }

  const totalMs = wasmMs.map((w, i) => w + modelMs[i]);
  return {
    delegate,
    iterations,
    wasmLoadMs: { median: median(wasmMs), p95: p95(wasmMs), samples: wasmMs },
    modelInitMs: { median: median(modelMs), p95: p95(modelMs), samples: modelMs },
    totalLoadMs: { median: median(totalMs), p95: p95(totalMs), samples: totalMs }
  };
}

async function benchInferenceFps(fileset, frames = 45) {
  const opts = {
    baseOptions: { modelAssetPath: '../vendor/pose_landmarker_lite.task', delegate: 'GPU' },
    runningMode: 'IMAGE',
    numPoses: 1
  };
  let landmarker;
  try {
    landmarker = await PoseLandmarker.createFromOptions(fileset, opts);
  } catch {
    opts.baseOptions.delegate = 'CPU';
    landmarker = await PoseLandmarker.createFromOptions(fileset, opts);
  }

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  const inferenceMs = [];

  for (let frame = 0; frame < frames; frame++) {
    ctx.fillStyle = `hsl(${(frame * 3) % 360}, 60%, 45%)`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const bmp = await createImageBitmap(canvas);
    const t0 = performance.now();
    landmarker.detect(bmp);
    inferenceMs.push(performance.now() - t0);
    bmp.close();
  }

  landmarker.close();
  const medianMs = median(inferenceMs);
  const maxFps = medianMs > 0 ? 1000 / medianMs : 0;

  return {
    mode: 'IMAGE',
    frames,
    inferenceMs: {
      median: Math.round(medianMs * 100) / 100,
      p95: Math.round(p95(inferenceMs) * 100) / 100
    },
    theoreticalMaxFps: Math.round(maxFps * 10) / 10,
    note: 'Production break page uses VIDEO mode at camera frame rate (~30fps).'
  };
}

async function benchStorageLatency(samples = 50) {
  const sameContext = [];
  const crossContext = [];

  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    await new Promise((resolve) => {
      const listener = (changes) => {
        if (changes.benchPing) {
          chrome.storage.local.onChanged.removeListener(listener);
          sameContext.push(performance.now() - t0);
          resolve();
        }
      };
      chrome.storage.local.onChanged.addListener(listener);
      chrome.storage.local.set({ benchPing: t0 });
    });
  }

  // Cross-context: listener page vs writer via background message relay
  await new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: 'BENCH_STORAGE_START' }, resolve);
  });

  for (let i = 0; i < samples; i++) {
    const latency = await new Promise((resolve) => {
      const listener = (changes) => {
        if (changes.benchCross) {
          chrome.storage.local.onChanged.removeListener(listener);
          resolve(performance.now() - changes.benchCross.newValue.sentAt);
        }
      };
      chrome.storage.local.onChanged.addListener(listener);
      const sentAt = performance.now();
      chrome.runtime.sendMessage({ action: 'BENCH_STORAGE_WRITE', index: i, sentAt });
    });
    crossContext.push(latency);
  }

  return {
    samples,
    sameContextMs: { median: median(sameContext), p95: p95(sameContext) },
    crossContextMs: { median: median(crossContext), p95: p95(crossContext) },
    breakProgressSimulationMs: crossContext
  };
}

async function run() {
  const params = new URLSearchParams(location.search);
  const mode = params.get('mode') || 'full';
  const browserOnly = mode === 'browser-only';
  const storageOnly = mode === 'storage-only';
  const results = { timestamp: new Date().toISOString(), mode };

  if (!storageOnly) {
    try {
      results.modelLoad = await benchModelLoad(3);
    } catch (err) {
      results.modelLoad = { error: String(err) };
    }

    try {
      const fileset = await FilesetResolver.forVisionTasks('../vendor/tasks-vision/wasm');
      results.inference = await benchInferenceFps(fileset, 30);
    } catch (err) {
      results.inference = { error: String(err) };
    }
  }

  if (!browserOnly) {
    try {
      if (!globalThis.chrome?.storage?.local) {
        results.storage = { skipped: 'chrome.storage unavailable' };
      } else {
        results.storage = await benchStorageLatency(30);
      }
    } catch (err) {
      results.storage = { error: String(err) };
    }
  }

  out.textContent = JSON.stringify(results, null, 2);
  out.dataset.done = '1';
  return results;
}

run().catch((err) => {
  out.textContent = JSON.stringify({ error: String(err), stack: err.stack }, null, 2);
  out.dataset.done = '1';
}).finally(() => {
  out.dataset.done = '1';
});
