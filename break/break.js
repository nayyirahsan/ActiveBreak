// ActiveBreak break page.
// Runs MediaPipe PoseLandmarker (bundled locally, fully on-device) and counts
// reps with per-exercise form state machines: a rep only counts when the body
// moves through the full range of motion, not just when pixels change.
// Live progress is mirrored to chrome.storage.local so the popup and the
// lock screens on other tabs can show it in real time.

import {
  FilesetResolver,
  PoseLandmarker,
  DrawingUtils
} from '../vendor/tasks-vision/vision_bundle.mjs';

// Pose landmark indices (MediaPipe's 33-point model).
const NOSE = 0;
const L_SHOULDER = 11, R_SHOULDER = 12;
const L_ELBOW = 13, R_ELBOW = 14;
const L_WRIST = 15, R_WRIST = 16;
const L_HIP = 23, R_HIP = 24;
const L_KNEE = 25, R_KNEE = 26;
const L_ANKLE = 27, R_ANKLE = 28;

const FALLBACK_SECONDS = 30;
const STABLE_FRAMES = 3;        // a phase must hold this many frames to count
const MIN_REP_GAP_MS = 400;

// Each checker maps landmarks -> { phase: 'start' | 'bottom' | null, hint }.
// A rep = start -> bottom -> start, so half-hearted movement never counts.
const EXERCISES = {
  jumping_jacks: {
    name: 'Jumping Jacks',
    reps: 10,
    tip: 'Stand back so your whole body is in frame. Jump legs wide with arms overhead, then back together.',
    needed: [NOSE, L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST, L_ANKLE, R_ANKLE],
    check(lm) {
      const shoulderW = Math.abs(lm[L_SHOULDER].x - lm[R_SHOULDER].x);
      const ankleSpread = Math.abs(lm[L_ANKLE].x - lm[R_ANKLE].x);
      const armsUp = lm[L_WRIST].y < lm[NOSE].y && lm[R_WRIST].y < lm[NOSE].y;
      const armsDown = lm[L_WRIST].y > lm[L_SHOULDER].y && lm[R_WRIST].y > lm[R_SHOULDER].y;
      if (armsUp && ankleSpread > shoulderW * 1.5) return { phase: 'bottom', hint: 'Now back to standing' };
      if (armsDown && ankleSpread < shoulderW * 1.15) return { phase: 'start', hint: 'Jump: legs wide, arms overhead' };
      return { phase: null, hint: 'Full range: arms all the way up, legs wide' };
    }
  },
  squats: {
    name: 'Squats',
    reps: 8,
    tip: 'Face the camera with your whole body in frame. Sink until your knees bend past 90°, then stand tall.',
    needed: [L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANKLE, R_ANKLE],
    check(lm) {
      const kneeAngle = (
        angleDeg(lm[L_HIP], lm[L_KNEE], lm[L_ANKLE]) +
        angleDeg(lm[R_HIP], lm[R_KNEE], lm[R_ANKLE])
      ) / 2;
      if (kneeAngle < 110) return { phase: 'bottom', hint: 'Good depth — stand all the way up' };
      if (kneeAngle > 160) return { phase: 'start', hint: 'Sink into the squat' };
      return { phase: null, hint: 'Deeper — hips down to knee level' };
    }
  },
  push_ups: {
    name: 'Push-ups',
    reps: 5,
    tip: 'Set the camera so it sees you side-on in plank. Lower until your elbows pass 90°, then press up.',
    needed: [L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST, L_HIP, R_HIP],
    check(lm) {
      const shoulderY = (lm[L_SHOULDER].y + lm[R_SHOULDER].y) / 2;
      const hipY = (lm[L_HIP].y + lm[R_HIP].y) / 2;
      if (Math.abs(shoulderY - hipY) > 0.22) {
        return { phase: null, hint: 'Get into a plank, side-on to the camera' };
      }
      const elbowAngle = (
        angleDeg(lm[L_SHOULDER], lm[L_ELBOW], lm[L_WRIST]) +
        angleDeg(lm[R_SHOULDER], lm[R_ELBOW], lm[R_WRIST])
      ) / 2;
      if (elbowAngle < 100) return { phase: 'bottom', hint: 'Press all the way up' };
      if (elbowAngle > 150) return { phase: 'start', hint: 'Lower your chest' };
      return { phase: null, hint: 'Full range — chest low, arms locked out' };
    }
  }
};

const els = {
  video: document.getElementById('webcam'),
  canvas: document.getElementById('skeleton'),
  webcamMsg: document.getElementById('webcam-msg'),
  formHint: document.getElementById('form-hint'),
  segments: document.getElementById('segments'),
  reps: document.getElementById('reps'),
  repTotal: document.getElementById('rep-total'),
  status: document.getElementById('status'),
  doneBtn: document.getElementById('done-btn'),
  skipBtn: document.getElementById('skip-btn'),
  exerciseName: document.getElementById('exercise-name'),
  exerciseTip: document.getElementById('exercise-tip'),
  sessionActive: document.getElementById('session-active'),
  sessionComplete: document.getElementById('session-complete'),
  completeSummary: document.getElementById('complete-summary')
};

let exercise = EXERCISES.jumping_jacks;
let running = false;
let repsDone = 0;
let finished = false;

init();

async function init() {
  const { breakActive, breakExercise, repTargets } =
    await chrome.storage.local.get(['breakActive', 'breakExercise', 'repTargets']);
  const base = EXERCISES[breakExercise] || EXERCISES.jumping_jacks;
  // Rep targets are user-configurable on the settings page.
  const customReps = repTargets && repTargets[breakExercise];
  exercise = customReps ? { ...base, reps: Math.min(50, Math.max(1, Math.round(customReps))) } : base;

  els.exerciseName.textContent = exercise.name;
  els.exerciseTip.textContent = exercise.tip;
  els.repTotal.textContent = exercise.reps;
  els.segments.setAttribute('aria-valuemax', exercise.reps);
  renderSegments(0);

  els.doneBtn.addEventListener('click', () => complete(false));
  els.skipBtn.addEventListener('click', () => complete(!finished));

  if (breakActive) {
    // Mirror initial progress so the popup and lock screens can show it live.
    chrome.storage.local.set({ breakProgress: { done: 0, total: exercise.reps, name: exercise.name } });
  } else {
    // Opened outside a break (e.g. stale tab) — nothing to enforce.
    setStatus('No break is active right now. You can close this tab.');
  }

  try {
    els.webcamMsg.textContent = 'Waiting for camera access — click “Allow” if prompted…';
    setStatus('Waiting for camera access…');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 960, height: 720 },
      audio: false
    });
    els.webcamMsg.textContent = 'Loading pose model…';
    setStatus('Loading pose model…');
    els.video.srcObject = stream;
    await new Promise((resolve) => { els.video.onloadedmetadata = resolve; });
    await els.video.play();
  } catch {
    startFallback('Camera unavailable or permission denied.');
    return;
  }

  try {
    const landmarker = await createLandmarker();
    els.webcamMsg.hidden = true;
    els.formHint.hidden = false;
    startDetection(landmarker);
  } catch (err) {
    console.error('ActiveBreak: pose model failed to load', err);
    startFallback('Pose detection failed to start.');
  }
}

async function createLandmarker() {
  const fileset = await FilesetResolver.forVisionTasks('../vendor/tasks-vision/wasm');
  const options = (delegate) => ({
    baseOptions: {
      modelAssetPath: '../vendor/pose_landmarker_lite.task',
      delegate
    },
    runningMode: 'VIDEO',
    numPoses: 1
  });
  try {
    return await PoseLandmarker.createFromOptions(fileset, options('GPU'));
  } catch {
    return await PoseLandmarker.createFromOptions(fileset, options('CPU'));
  }
}

function startDetection(landmarker) {
  const ctx = els.canvas.getContext('2d');
  const drawer = new DrawingUtils(ctx);
  els.canvas.width = els.video.videoWidth;
  els.canvas.height = els.video.videoHeight;

  let armed = false;              // reached the bottom of the current rep
  let stablePhase = 'start';
  let candidate = null;
  let candidateCount = 0;
  let lastRepAt = 0;
  let lastVideoTime = -1;
  running = true;

  setStatus('Get in frame to begin');

  const loop = () => {
    if (!running) return;
    try {
      detectOnce();
    } catch (err) {
      // Detection crashed (e.g. no WebGL) — don't lock the user out.
      running = false;
      console.error('ActiveBreak: pose detection crashed', err);
      els.webcamMsg.hidden = false;
      els.formHint.hidden = true;
      startFallback('Pose detection isn’t working on this device.');
      return;
    }
    requestAnimationFrame(loop);
  };

  const detectOnce = () => {
    if (els.video.currentTime !== lastVideoTime) {
      lastVideoTime = els.video.currentTime;
      const result = landmarker.detectForVideo(els.video, performance.now());
      const lm = result.landmarks && result.landmarks[0];

      ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
      if (lm) {
        drawer.drawConnectors(lm, PoseLandmarker.POSE_CONNECTIONS, { color: '#4f46e5', lineWidth: 3 });
        drawer.drawLandmarks(lm, { color: '#ffffff', radius: 4 });
      }

      if (!lm || !allVisible(lm, exercise.needed)) {
        setHint('Step back so your whole body is in frame');
      } else {
        const { phase, hint } = exercise.check(lm);
        setHint(hint);

        // Debounce: a phase must hold for a few frames before it counts.
        if (phase === candidate) {
          candidateCount++;
        } else {
          candidate = phase;
          candidateCount = 1;
        }
        if (candidate !== null && candidate !== stablePhase && candidateCount >= STABLE_FRAMES) {
          stablePhase = candidate;
          if (stablePhase === 'bottom') armed = true;
          if (stablePhase === 'start' && armed && Date.now() - lastRepAt >= MIN_REP_GAP_MS) {
            armed = false;
            lastRepAt = Date.now();
            repsDone++;
            onRep(repsDone);
          }
        }
      }
    }
  };
  requestAnimationFrame(loop);
}

function onRep(reps) {
  const shown = Math.min(reps, exercise.reps);
  els.reps.textContent = shown;
  els.reps.classList.remove('ab-pop');
  void els.reps.offsetWidth; // restart the pop animation
  els.reps.classList.add('ab-pop');
  renderSegments(shown);
  chrome.storage.local.set({ breakProgress: { done: shown, total: exercise.reps, name: exercise.name } });

  if (reps >= exercise.reps) {
    running = false;
    finished = true;
    setHint('Done — you can head back to work.');
    showComplete(`${exercise.reps} verified ${exercise.name.toLowerCase()} — nice work.`);
  } else {
    setStatus(`Rep ${shown} verified — keep going`);
  }
}

function renderSegments(done) {
  els.segments.setAttribute('aria-valuenow', done);
  els.segments.setAttribute('aria-valuetext', `${done} of ${exercise.reps} reps verified`);
  if (els.segments.childElementCount !== exercise.reps) {
    els.segments.replaceChildren(
      ...Array.from({ length: exercise.reps }, () => document.createElement('span'))
    );
  }
  [...els.segments.children].forEach((seg, i) => {
    seg.classList.toggle('ab-filled', i < done);
  });
}

// No camera / model failure: enforce a timed breather instead of locking the user out.
function startFallback(reason) {
  els.webcamMsg.textContent = `${reason} Stand up and stretch instead.`;
  els.segments.hidden = true;
  els.segments.removeAttribute('role');
  document.querySelector('.ab-count').hidden = true;
  let remaining = FALLBACK_SECONDS;
  setStatus(`No camera — take a ${FALLBACK_SECONDS}-second breather`);
  els.doneBtn.textContent = `Unlocks in ${remaining}s`;
  const timer = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(timer);
      finished = true;
      showComplete('Breather complete — thanks for stepping away.');
    } else {
      els.doneBtn.textContent = `Unlocks in ${remaining}s`;
    }
  }, 1000);
}

function showComplete(summary) {
  els.sessionActive.hidden = true;
  els.sessionComplete.hidden = false;
  els.completeSummary.textContent = summary;
  els.doneBtn.disabled = false;
  els.doneBtn.textContent = 'Back to work';
  els.doneBtn.classList.add('ab-ready');
  els.doneBtn.focus();
}

function complete(skipped) {
  running = false;
  const stream = els.video.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  // Background records stats, unlocks every tab, re-arms the timer, and closes this tab.
  chrome.runtime.sendMessage({
    action: 'BREAK_COMPLETE',
    reps: Math.min(repsDone, exercise.reps),
    skipped
  }).catch(() => {});
}

function setStatus(text) {
  els.status.textContent = text;
}

function setHint(text) {
  els.formHint.textContent = text;
}

function allVisible(lm, indices, min = 0.5) {
  return indices.every((i) => lm[i] && (lm[i].visibility ?? 1) >= min);
}

function angleDeg(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (mag === 0) return 180;
  return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * (180 / Math.PI);
}
