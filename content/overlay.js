// ActiveBreak lock screen.
// During a break every tab is covered by this overlay; the exercise itself
// happens in the dedicated break tab (break/break.html). Rep progress is
// mirrored here live from chrome.storage.local.
(() => {
  if (window.__activebreakLoaded) return;
  window.__activebreakLoaded = true;

  const EXERCISE_NAMES = {
    jumping_jacks: 'Jumping Jacks',
    squats: 'Squats',
    push_ups: 'Push-ups'
  };

  const LOGO_SVG = `
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill="#4f46e5"/>
      <path d="M5 12.5h3l1.9-4.8 3.7 8.4 1.9-4.8H19" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  let overlay = null;

  // A break may already be running when this tab loads.
  chrome.storage.local.get(['breakActive', 'breakExercise', 'breakProgress'], (data) => {
    if (data.breakActive && data.breakExercise) {
      showOverlay(data.breakExercise);
      updateProgress(data.breakProgress);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'SHOW_OVERLAY') showOverlay(message.exercise);
    if (message.action === 'HIDE_OVERLAY') removeOverlay();
  });

  // Unlock when the break completes elsewhere; mirror rep progress live.
  chrome.storage.local.onChanged.addListener((changes) => {
    if (changes.breakActive && changes.breakActive.newValue === false) removeOverlay();
    if (changes.breakProgress) updateProgress(changes.breakProgress.newValue);
  });

  function showOverlay(exerciseKey) {
    if (overlay) return;

    overlay = document.createElement('div');
    overlay.id = 'activebreak-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'ActiveBreak exercise break');
    overlay.innerHTML = `
      <div class="ab-modal">
        <div class="ab-brand">${LOGO_SVG}<span>ActiveBreak</span></div>
        <h2 class="ab-title">Time for a break</h2>
        <p class="ab-lede">This tab is paused while you take your exercise break.</p>
        <div class="ab-exercise">
          <div class="ab-exercise-row">
            <span class="ab-exercise-name">${EXERCISE_NAMES[exerciseKey] || 'Exercise'}</span>
            <span class="ab-progress-text" id="ab-progress-text" role="status">Waiting for you in the break tab</span>
          </div>
          <div class="ab-segments" id="ab-segments" hidden></div>
        </div>
        <button id="ab-go-btn">Go to my break</button>
        <div class="ab-privacy">Pose detection runs entirely on your device — video never leaves your browser.</div>
      </div>
    `;
    (document.body || document.documentElement).appendChild(overlay);
    document.documentElement.classList.add('ab-scroll-lock');

    const goBtn = overlay.querySelector('#ab-go-btn');
    goBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'FOCUS_BREAK_TAB' }).catch(() => {});
    });
    goBtn.focus();
  }

  function updateProgress(progress) {
    if (!overlay || !progress || !progress.total) return;
    const text = overlay.querySelector('#ab-progress-text');
    const segments = overlay.querySelector('#ab-segments');
    text.textContent = `${progress.done} of ${progress.total} reps verified`;
    segments.hidden = false;
    if (segments.childElementCount !== progress.total) {
      segments.replaceChildren(
        ...Array.from({ length: progress.total }, () => document.createElement('span'))
      );
    }
    [...segments.children].forEach((seg, i) => {
      seg.classList.toggle('ab-filled', i < progress.done);
    });
  }

  function removeOverlay() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.documentElement.classList.remove('ab-scroll-lock');
  }
})();
