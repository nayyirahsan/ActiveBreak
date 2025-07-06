#!/usr/bin/env node
// Synthetic rep-count accuracy: tests FSM on ideal + adversarial landmark sequences.
// Real-world webcam accuracy requires labeled video (not in repo).

import {
  countRepsFromSequence,
  jjFrames,
  squatFrames,
  pushupFrames,
  halfJjFrames
} from './rep-engine.mjs';

function trial(name, expected, actual) {
  return { name, expected, actual, pass: expected === actual };
}

function runSuite() {
  const cases = [
    trial('jj ideal x10', 10, countRepsFromSequence('jumping_jacks', jjFrames(10)).reps),
    trial('jj ideal x20', 20, countRepsFromSequence('jumping_jacks', jjFrames(20)).reps),
    trial('squat ideal x8', 8, countRepsFromSequence('squats', squatFrames(8)).reps),
    trial('pushup ideal x5', 5, countRepsFromSequence('push_ups', pushupFrames(5)).reps),
    trial('jj half-ROM x5 (expect 0)', 0, countRepsFromSequence('jumping_jacks', halfJjFrames(5)).reps),
  ];

  const noisy = jjFrames(10).map((lm) =>
    lm.map((p) => ({
      ...p,
      x: p.x + (Math.random() - 0.5) * 0.02,
      y: p.y + (Math.random() - 0.5) * 0.02
    }))
  );
  cases.push(trial('jj noisy x10', 10, countRepsFromSequence('jumping_jacks', noisy).reps));

  const passed = cases.filter((c) => c.pass).length;
  const accuracy = (passed / cases.length) * 100;

  return {
    cases,
    syntheticAccuracy: accuracy,
    note: 'Synthetic FSM accuracy on ideal/adversarial landmark sequences. Real-world webcam accuracy requires labeled video.'
  };
}

const result = runSuite();
console.log(JSON.stringify(result, null, 2));
