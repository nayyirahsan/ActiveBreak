let overlay = null;
let webcamStream = null;
let poseDetector = null;
let poseDetectionActive = false;

// On script load, check if a break is active
chrome.storage.sync.get(['breakActive', 'breakExercise'], (data) => {
  if (data.breakActive && data.breakExercise) {
    showOverlay(data.breakExercise, true);
  }
});

function removeOverlay() {
  poseDetectionActive = false;
  if (poseDetector && poseDetector.close) {
    poseDetector.close();
    poseDetector = null;
  }
  if (overlay) {
    // Stop webcam stream if active
    if (webcamStream) {
      webcamStream.getTracks().forEach(track => track.stop());
      webcamStream = null;
    }
    overlay.remove();
    overlay = null;
    document.body.style.overflow = '';
    // Notify background that break is complete
    chrome.runtime.sendMessage({ action: 'BREAK_COMPLETE' });
  }
}

function showOverlay(exercise, blockAll = false) {
  if (overlay) return; // Prevent multiple overlays
  window.currentExerciseForDetection = exercise;

  overlay = document.createElement('div');
  overlay.id = 'activebreak-overlay';
  if (blockAll) {
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.zIndex = '2147483647';
    overlay.style.pointerEvents = 'all';
    overlay.tabIndex = -1;
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('role', 'dialog');
    // Trap focus in overlay
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
      }
    });
    document.body.addEventListener('focus', trapFocus, true);
  }
  overlay.innerHTML = `
    <div class="ab-modal">
      <h2>Break Time!</h2>
      <p>Complete the exercise below to unlock your screen.</p>
      <div class="ab-exercise">${formatExercise(exercise)}</div>
      <div class="ab-webcam-container">
        <video id="ab-webcam" autoplay playsinline muted width="320" height="220" style="background:#eaf1fb; border-radius:10px;"></video>
        <canvas id="ab-canvas" width="320" height="220" style="position:absolute;left:0;top:0;pointer-events:none;"></canvas>
      </div>
      <button id="ab-close-btn" disabled>Done</button>
      <button id="ab-bypass-btn" style="margin-top:10px;background:#e57373;color:#fff;border:none;border-radius:8px;padding:10px 28px;font-size:15px;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(44,62,80,0.10);">Bypass (Test)</button>
      <div class="ab-timer" id="ab-timer-msg">Waiting for pose detection...</div>
      <div class="ab-privacy-note">Your camera never leaves your device. AI runs locally for your privacy.</div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  // Start webcam
  const video = document.getElementById('ab-webcam');
  const canvas = document.getElementById('ab-canvas');
  const closeBtn = document.getElementById('ab-close-btn');
  const bypassBtn = document.getElementById('ab-bypass-btn');
  const timerMsg = document.getElementById('ab-timer-msg');

  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        webcamStream = stream;
        video.srcObject = stream;
        video.onloadedmetadata = () => {
          video.play();
          loadMediaPipePose(video, canvas, closeBtn, timerMsg);
        };
      })
      .catch(err => {
        video.style.background = '#fbeaea';
        video.style.color = '#c00';
        video.style.display = 'flex';
        video.style.alignItems = 'center';
        video.style.justifyContent = 'center';
        video.srcObject = null;
        video.poster = '';
        video.insertAdjacentHTML('afterend', '<div style="color:#c00;">Webcam access denied</div>');
        timerMsg.textContent = 'Webcam access denied.';
      });
  }

  closeBtn.addEventListener('click', removeOverlay);
  bypassBtn.addEventListener('click', removeOverlay);
}

function formatExercise(ex) {
  switch (ex) {
    case 'jumping_jacks': return 'Jumping Jacks';
    case 'squats': return 'Squats';
    case 'push_ups': return 'Push-ups';
    case 'random': return 'Random Exercise';
    default: return ex;
  }
}

function loadMediaPipePose(video, canvas, closeBtn, timerMsg) {
  if (window.Pose) {
    startPoseDetection(video, canvas, closeBtn, timerMsg);
    return;
  }
  // Load MediaPipe Pose via CDN
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675466197/pose.js';
  script.onload = () => {
    const script2 = document.createElement('script');
    script2.src = 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils@0.5.1675466197/drawing_utils.js';
    script2.onload = () => {
      startPoseDetection(video, canvas, closeBtn, timerMsg);
    };
    document.body.appendChild(script2);
  };
  document.body.appendChild(script);
}

function startPoseDetection(video, canvas, closeBtn, timerMsg) {
  poseDetectionActive = true;
  poseDetector = new window.Pose.Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675466197/${file}`
  });
  poseDetector.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    enableSegmentation: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
  });
  poseDetector.onResults((results) => {
    drawPose(results, canvas, video);
    // Exercise-specific detection
    if (window.currentExerciseForDetection === 'jumping_jacks') {
      if (isJumpingJack(results.poseLandmarks)) {
        closeBtn.disabled = false;
        timerMsg.textContent = 'Jumping Jack detected!';
      } else {
        closeBtn.disabled = true;
        timerMsg.textContent = 'Do a Jumping Jack to continue...';
      }
    } else if (window.currentExerciseForDetection === 'squats') {
      if (isSquat(results.poseLandmarks)) {
        closeBtn.disabled = false;
        timerMsg.textContent = 'Squat detected!';
      } else {
        closeBtn.disabled = true;
        timerMsg.textContent = 'Do a Squat to continue...';
      }
    } else if (window.currentExerciseForDetection === 'push_ups') {
      if (isPushUp(results.poseLandmarks)) {
        closeBtn.disabled = false;
        timerMsg.textContent = 'Push-up detected!';
      } else {
        closeBtn.disabled = true;
        timerMsg.textContent = 'Do a Push-up to continue...';
      }
    } else {
      // Default: enable if any pose detected
      if (results.poseLandmarks && results.poseLandmarks.length > 0) {
        closeBtn.disabled = false;
        timerMsg.textContent = 'Verification complete!';
      } else {
        closeBtn.disabled = true;
        timerMsg.textContent = 'Waiting for pose detection...';
      }
    }
  });

  async function detectFrame() {
    if (!poseDetectionActive) return;
    await poseDetector.send({ image: video });
    requestAnimationFrame(detectFrame);
  }
  detectFrame();
}

// Simple rule-based jumping jack detection
function isJumpingJack(landmarks) {
  if (!landmarks || landmarks.length < 33) return false;
  // Arms above head: both wrists above both eyes
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftEye = landmarks[1];
  const rightEye = landmarks[4];
  const headY = Math.min(leftEye.y, rightEye.y);
  const wristsAboveHead = leftWrist.y < headY && rightWrist.y < headY;
  // Legs apart: distance between ankles is wide
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  const ankleDist = Math.abs(leftAnkle.x - rightAnkle.x);
  const legsApart = ankleDist > 0.35; // Empirical threshold
  return wristsAboveHead && legsApart;
}

// Simple rule-based squat detection
function isSquat(landmarks) {
  if (!landmarks || landmarks.length < 33) return false;
  // Hips close to knees, knees bent, torso upright
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  // Average y for hips and knees
  const hipY = (leftHip.y + rightHip.y) / 2;
  const kneeY = (leftKnee.y + rightKnee.y) / 2;
  const ankleY = (leftAnkle.y + rightAnkle.y) / 2;
  // Hip should be close to knee (squatting)
  const hipKneeDist = Math.abs(hipY - kneeY);
  // Knee should be well above ankle (bent)
  const kneeAnkleDist = Math.abs(kneeY - ankleY);
  // Torso upright: shoulder-hip x diff small
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const shoulderHipXDiff = Math.abs(((leftShoulder.x + rightShoulder.x) / 2) - ((leftHip.x + rightHip.x) / 2));
  // Empirical thresholds
  return hipKneeDist < 0.08 && kneeAnkleDist > 0.15 && shoulderHipXDiff < 0.08;
}

// Simple rule-based push-up detection
function isPushUp(landmarks) {
  if (!landmarks || landmarks.length < 33) return false;
  // Body horizontal: y-diff between shoulders and ankles is small
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];
  const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const avgAnkleY = (leftAnkle.y + rightAnkle.y) / 2;
  const bodyHorizontal = Math.abs(avgShoulderY - avgAnkleY) < 0.15;
  // Elbows bent: elbow below shoulder
  const leftElbow = landmarks[13];
  const rightElbow = landmarks[14];
  const leftWrist = landmarks[15];
  const rightWrist = landmarks[16];
  const leftElbowBent = leftElbow.y > leftShoulder.y && leftElbow.y < leftWrist.y;
  const rightElbowBent = rightElbow.y > rightShoulder.y && rightElbow.y < rightWrist.y;
  // Chest close to hands: shoulder close to wrist y
  const leftChestNearHand = Math.abs(leftShoulder.y - leftWrist.y) < 0.12;
  const rightChestNearHand = Math.abs(rightShoulder.y - rightWrist.y) < 0.12;
  // Empirical: require body horizontal and at least one arm bent and chest near hand
  return bodyHorizontal && ((leftElbowBent && leftChestNearHand) || (rightElbowBent && rightChestNearHand));
}

function drawPose(results, canvas, video) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (results.poseLandmarks) {
    window.drawConnectors(ctx, results.poseLandmarks, window.POSE_CONNECTIONS, { color: '#2d7ff9', lineWidth: 2 });
    window.drawLandmarks(ctx, results.poseLandmarks, { color: '#ff9800', lineWidth: 1 });
  }
}

function trapFocus(e) {
  if (overlay && !overlay.contains(e.target)) {
    e.stopPropagation();
    overlay.focus();
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'SHOW_OVERLAY') {
    showOverlay(message.exercise, message.blockAll);
  }
}); 