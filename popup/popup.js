// ActiveBreak popup.
// State-aware: idle shows setup, running shows the countdown (settings tucked
// behind "Adjust schedule"), and during a break it mirrors live rep progress.

const EXERCISE_LABELS = {
  random: 'Surprise me',
  jumping_jacks: 'Jumping Jacks',
  squats: 'Squats',
  push_ups: 'Push-ups'
};

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('setup-form');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const adjustBtn = document.getElementById('adjust-btn');
  const goBreakBtn = document.getElementById('go-break-btn');
  const runActions = document.getElementById('run-actions');
  const statusEl = document.getElementById('status');
  const statsLine = document.getElementById('stats-line');
  const ring = document.getElementById('ring');
  const timeDisplay = document.getElementById('time-display');
  const timeLabel = document.getElementById('time-label');
  const contextLine = document.getElementById('context-line');

  let adjustOpen = false;

  // Restore last-used settings.
  chrome.storage.local.get(['interval', 'exercise'], (data) => {
    if (data.interval) checkRadio('interval', String(data.interval));
    if (data.exercise) checkRadio('exercise', data.exercise);
  });

  function checkRadio(name, value) {
    const input = form.querySelector(`input[name="${name}"][value="${value}"]`);
    if (input) input.checked = true;
  }

  function formatInterval(interval) {
    return Number(interval) < 1 ? '10 sec' : `${interval} min`;
  }

  function render() {
    chrome.storage.local.get(
      ['nextBreakTime', 'breakActive', 'interval', 'exercise', 'breakProgress', 'stats'],
      (data) => {
        ring.classList.remove('ab-live', 'ab-break');

        if (data.breakActive) {
          renderBreak(data);
        } else if (data.nextBreakTime) {
          renderRunning(data);
        } else {
          renderIdle();
        }

        renderStats(data.stats);
      }
    );
  }

  function renderIdle() {
    ring.style.setProperty('--pct', 0);
    timeDisplay.textContent = '—';
    timeLabel.textContent = 'no timer yet';
    contextLine.textContent = '';
    form.hidden = false;
    startBtn.textContent = 'Start timer';
    runActions.hidden = true;
    goBreakBtn.hidden = true;
  }

  function renderRunning(data) {
    const msLeft = Math.max(0, data.nextBreakTime - Date.now());
    const totalMs = (data.interval || 20) * 60 * 1000;
    const min = Math.floor(msLeft / 60000);
    const sec = Math.floor((msLeft % 60000) / 1000);

    ring.classList.add('ab-live');
    ring.style.setProperty('--pct', Math.min(100, (msLeft / totalMs) * 100));
    timeDisplay.textContent = `${min}:${String(sec).padStart(2, '0')}`;
    timeLabel.textContent = msLeft > 0 ? 'until next break' : 'break is due';
    contextLine.textContent =
      `${EXERCISE_LABELS[data.exercise] || 'Exercise'} · every ${formatInterval(data.interval)}`;

    form.hidden = !adjustOpen;
    startBtn.textContent = 'Update schedule';
    runActions.hidden = false;
    adjustBtn.hidden = false;
    goBreakBtn.hidden = true;
  }

  function renderBreak(data) {
    const progress = data.breakProgress;
    ring.classList.add('ab-break');
    if (progress && progress.total) {
      ring.style.setProperty('--pct', (progress.done / progress.total) * 100);
      timeDisplay.textContent = `${progress.done}/${progress.total}`;
      timeLabel.textContent = 'reps verified';
      contextLine.textContent = `${progress.name} in progress`;
    } else {
      ring.style.setProperty('--pct', 0);
      timeDisplay.textContent = '···';
      timeLabel.textContent = 'break starting';
      contextLine.textContent = 'Waiting for you in the break tab';
    }
    form.hidden = true;
    goBreakBtn.hidden = false;
    runActions.hidden = false;
    adjustBtn.hidden = true;
  }

  function renderStats(stats) {
    const today = new Date().toISOString().slice(0, 10);
    if (stats && stats.date === today && (stats.breaks || stats.reps)) {
      const breaks = `${stats.breaks} break${stats.breaks === 1 ? '' : 's'}`;
      const reps = stats.reps ? ` · ${stats.reps} verified reps` : '';
      statsLine.textContent = `Today: ${breaks}${reps}`;
      statsLine.hidden = false;
    } else {
      statsLine.hidden = true;
    }
  }

  render();
  setInterval(render, 1000);
  chrome.storage.local.onChanged.addListener(render);

  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('ab-error', isError);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const wasRunning = adjustOpen;
    const interval = Number(new FormData(form).get('interval'));
    const exercise = new FormData(form).get('exercise');
    chrome.runtime.sendMessage({ action: 'START_TIMER', interval, exercise }, (response) => {
      if (chrome.runtime.lastError || !response?.ok) {
        setStatus('Could not start the timer — try again.', true);
      } else {
        adjustOpen = false;
        adjustBtn.setAttribute('aria-expanded', 'false');
        setStatus(wasRunning ? 'Schedule updated.' : 'Timer started.');
        render();
      }
    });
  });

  adjustBtn.addEventListener('click', () => {
    adjustOpen = !adjustOpen;
    adjustBtn.setAttribute('aria-expanded', String(adjustOpen));
    adjustBtn.textContent = adjustOpen ? 'Close' : 'Adjust schedule';
    render();
  });

  stopBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'STOP_TIMER' }, () => {
      if (chrome.runtime.lastError) {
        setStatus('Could not stop the timer.', true);
      } else {
        adjustOpen = false;
        adjustBtn.setAttribute('aria-expanded', 'false');
        adjustBtn.textContent = 'Adjust schedule';
        setStatus('Timer stopped.');
        render();
      }
    });
  });

  goBreakBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'FOCUS_BREAK_TAB' }).catch(() => {});
    window.close();
  });

  document.getElementById('options-btn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
