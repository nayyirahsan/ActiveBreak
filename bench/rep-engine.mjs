// Rep-counting engine extracted from break/break.js for offline benchmarking.
// Mirrors production logic: per-exercise phase checkers + start→bottom→start FSM.

const NOSE = 0;
const L_SHOULDER = 11, R_SHOULDER = 12;
const L_ELBOW = 13, R_ELBOW = 14;
const L_WRIST = 15, R_WRIST = 16;
const L_HIP = 23, R_HIP = 24;
const L_KNEE = 25, R_KNEE = 26;
const L_ANKLE = 27, R_ANKLE = 28;

export const STABLE_FRAMES = 3;
export const MIN_REP_GAP_MS = 400;

export const EXERCISES = {
  jumping_jacks: {
    name: 'Jumping Jacks',
    needed: [NOSE, L_SHOULDER, R_SHOULDER, L_WRIST, R_WRIST, L_ANKLE, R_ANKLE],
    check(lm) {
      const shoulderW = Math.abs(lm[L_SHOULDER].x - lm[R_SHOULDER].x);
      const ankleSpread = Math.abs(lm[L_ANKLE].x - lm[R_ANKLE].x);
      const armsUp = lm[L_WRIST].y < lm[NOSE].y && lm[R_WRIST].y < lm[NOSE].y;
      const armsDown = lm[L_WRIST].y > lm[L_SHOULDER].y && lm[R_WRIST].y > lm[R_SHOULDER].y;
      if (armsUp && ankleSpread > shoulderW * 1.5) return { phase: 'bottom', hint: '' };
      if (armsDown && ankleSpread < shoulderW * 1.15) return { phase: 'start', hint: '' };
      return { phase: null, hint: '' };
    }
  },
  squats: {
    name: 'Squats',
    needed: [L_HIP, R_HIP, L_KNEE, R_KNEE, L_ANKLE, R_ANKLE],
    check(lm) {
      const kneeAngle = (
        angleDeg(lm[L_HIP], lm[L_KNEE], lm[L_ANKLE]) +
        angleDeg(lm[R_HIP], lm[R_KNEE], lm[R_ANKLE])
      ) / 2;
      if (kneeAngle < 110) return { phase: 'bottom', hint: '' };
      if (kneeAngle > 160) return { phase: 'start', hint: '' };
      return { phase: null, hint: '' };
    }
  },
  push_ups: {
    name: 'Push-ups',
    needed: [L_SHOULDER, R_SHOULDER, L_ELBOW, R_ELBOW, L_WRIST, R_WRIST, L_HIP, R_HIP],
    check(lm) {
      const shoulderY = (lm[L_SHOULDER].y + lm[R_SHOULDER].y) / 2;
      const hipY = (lm[L_HIP].y + lm[R_HIP].y) / 2;
      if (Math.abs(shoulderY - hipY) > 0.22) return { phase: null, hint: '' };
      const elbowAngle = (
        angleDeg(lm[L_SHOULDER], lm[L_ELBOW], lm[L_WRIST]) +
        angleDeg(lm[R_SHOULDER], lm[R_ELBOW], lm[R_WRIST])
      ) / 2;
      if (elbowAngle < 100) return { phase: 'bottom', hint: '' };
      if (elbowAngle > 150) return { phase: 'start', hint: '' };
      return { phase: null, hint: '' };
    }
  }
};

function angleDeg(a, b, c) {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (mag === 0) return 180;
  return Math.acos(Math.min(1, Math.max(-1, dot / mag))) * (180 / Math.PI);
}

function lmPoint(x, y, visibility = 1) {
  return { x, y, z: 0, visibility };
}

function blankLandmarks() {
  return Array.from({ length: 33 }, () => lmPoint(0.5, 0.5));
}

/** Feed a sequence of synthetic landmark frames through the rep FSM. */
export function countRepsFromSequence(exerciseKey, frames, { frameMs = 33 } = {}) {
  const exercise = EXERCISES[exerciseKey];
  let armed = false;
  let stablePhase = 'start';
  let candidate = null;
  let candidateCount = 0;
  let lastRepAt = -MIN_REP_GAP_MS;
  let reps = 0;
  const events = [];

  for (let i = 0; i < frames.length; i++) {
    const lm = frames[i];
    const { phase } = exercise.check(lm);
    const now = i * frameMs;

    if (phase === candidate) {
      candidateCount++;
    } else {
      candidate = phase;
      candidateCount = 1;
    }
    if (phase !== null && phase !== stablePhase && candidateCount >= STABLE_FRAMES) {
      stablePhase = phase;
      if (stablePhase === 'bottom') armed = true;
      if (stablePhase === 'start' && armed && now - lastRepAt >= MIN_REP_GAP_MS) {
        armed = false;
        lastRepAt = now;
        reps++;
        events.push({ frame: i, rep: reps });
      }
    }
  }
  return { reps, events };
}

/** Ideal jumping-jack rep: standing → wide/up → standing, repeated. */
export function jjFrames(reps, { holdFrames = 5 } = {}) {
  const frames = [];
  const standing = () => {
    const lm = blankLandmarks();
    lm[NOSE] = lmPoint(0.5, 0.2);
    lm[L_SHOULDER] = lmPoint(0.42, 0.32);
    lm[R_SHOULDER] = lmPoint(0.58, 0.32);
    lm[L_WRIST] = lmPoint(0.38, 0.45);
    lm[R_WRIST] = lmPoint(0.62, 0.45);
    lm[L_ANKLE] = lmPoint(0.44, 0.9);
    lm[R_ANKLE] = lmPoint(0.56, 0.9);
    return lm;
  };
  const wide = () => {
    const lm = standing();
    lm[L_WRIST] = lmPoint(0.3, 0.1);
    lm[R_WRIST] = lmPoint(0.7, 0.1);
    lm[L_ANKLE] = lmPoint(0.2, 0.9);
    lm[R_ANKLE] = lmPoint(0.8, 0.9);
    return lm;
  };
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < holdFrames; i++) frames.push(standing());
    for (let i = 0; i < holdFrames; i++) frames.push(wide());
    for (let i = 0; i < holdFrames; i++) frames.push(standing());
  }
  return frames;
}

/** Ideal squat rep: standing → deep → standing. */
export function squatFrames(reps, { holdFrames = 5 } = {}) {
  const frames = [];
  const standing = () => {
    const lm = blankLandmarks();
    lm[L_HIP] = lmPoint(0.45, 0.5);
    lm[R_HIP] = lmPoint(0.55, 0.5);
    lm[L_KNEE] = lmPoint(0.45, 0.7);
    lm[R_KNEE] = lmPoint(0.55, 0.7);
    lm[L_ANKLE] = lmPoint(0.45, 0.92);
    lm[R_ANKLE] = lmPoint(0.55, 0.92);
    return lm;
  };
  const deep = () => {
    const lm = blankLandmarks();
    lm[L_HIP] = lmPoint(0.45, 0.54);
    lm[R_HIP] = lmPoint(0.55, 0.54);
    lm[L_KNEE] = lmPoint(0.3, 0.65);
    lm[R_KNEE] = lmPoint(0.4, 0.65);
    lm[L_ANKLE] = lmPoint(0.45, 0.92);
    lm[R_ANKLE] = lmPoint(0.55, 0.92);
    return lm;
  };
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < holdFrames; i++) frames.push(standing());
    for (let i = 0; i < holdFrames; i++) frames.push(deep());
    for (let i = 0; i < holdFrames; i++) frames.push(standing());
  }
  return frames;
}

/** Ideal push-up rep: plank up → down → up. */
export function pushupFrames(reps, { holdFrames = 5 } = {}) {
  const frames = [];
  const up = () => {
    const lm = blankLandmarks();
    lm[L_SHOULDER] = lmPoint(0.4, 0.4);
    lm[R_SHOULDER] = lmPoint(0.6, 0.4);
    lm[L_ELBOW] = lmPoint(0.35, 0.5);
    lm[R_ELBOW] = lmPoint(0.65, 0.5);
    lm[L_WRIST] = lmPoint(0.32, 0.58);
    lm[R_WRIST] = lmPoint(0.68, 0.58);
    lm[L_HIP] = lmPoint(0.42, 0.42);
    lm[R_HIP] = lmPoint(0.58, 0.42);
    return lm;
  };
  const down = () => {
    const lm = blankLandmarks();
    lm[L_SHOULDER] = lmPoint(0.4, 0.35);
    lm[R_SHOULDER] = lmPoint(0.6, 0.35);
    lm[L_ELBOW] = lmPoint(0.35, 0.48);
    lm[R_ELBOW] = lmPoint(0.65, 0.48);
    lm[L_WRIST] = lmPoint(0.32, 0.45);
    lm[R_WRIST] = lmPoint(0.68, 0.45);
    lm[L_HIP] = lmPoint(0.42, 0.37);
    lm[R_HIP] = lmPoint(0.58, 0.37);
    return lm;
  };
  for (let r = 0; r < reps; r++) {
    for (let i = 0; i < holdFrames; i++) frames.push(up());
    for (let i = 0; i < holdFrames; i++) frames.push(down());
    for (let i = 0; i < holdFrames; i++) frames.push(up());
  }
  return frames;
}

/** Half-rep (no full ROM) — should NOT count. */
export function halfJjFrames(reps) {
  const frames = [];
  const standing = () => jjFrames(1, { holdFrames: 2 })[0];
  const half = () => {
    const lm = standing();
    lm[L_WRIST] = lmPoint(0.38, 0.25);
    lm[R_WRIST] = lmPoint(0.62, 0.25);
    return lm;
  };
  for (let r = 0; r < reps; r++) {
    frames.push(standing(), standing(), half(), half(), standing(), standing());
  }
  return frames;
}
