document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('setup-form');
  const statusDiv = document.getElementById('status');
  let countdownInterval = null;

  // Restore previous settings if available
  chrome.storage.sync.get(['timer', 'exercise'], (data) => {
    if (data.timer) document.getElementById('timer').value = data.timer;
    if (data.exercise) document.getElementById('exercise').value = data.exercise;
  });

  // Countdown display
  function updateCountdownDisplay() {
    chrome.storage.sync.get(['nextBreakTime'], (data) => {
      const display = document.getElementById('countdown-display');
      if (!data.nextBreakTime) {
        display.textContent = '';
        return;
      }
      const now = Date.now();
      const msLeft = data.nextBreakTime - now;
      if (msLeft <= 0) {
        display.textContent = 'Break is due!';
        return;
      }
      const totalSeconds = Math.floor(msLeft / 1000);
      const min = Math.floor(totalSeconds / 60);
      const sec = totalSeconds % 60;
      display.textContent = `Next break in: ${min}:${sec.toString().padStart(2, '0')}`;
    });
  }

  function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    updateCountdownDisplay();
    countdownInterval = setInterval(updateCountdownDisplay, 1000);
  }

  startCountdown();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const timer = document.getElementById('timer').value;
    const exercise = document.getElementById('exercise').value;
    const now = Date.now();
    const nextBreakTime = now + Number(timer) * 60 * 1000;
    chrome.storage.sync.set({ timer, exercise, nextBreakTime, breakActive: false }, () => {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Error saving settings.';
        statusDiv.style.color = 'red';
        return;
      }
      statusDiv.textContent = 'Break timer started!';
      statusDiv.style.color = '#2d7ff9';
      // Notify background to start timer
      chrome.runtime.sendMessage({ action: 'START_TIMER', timer: Number(timer), exercise }, (response) => {
        if (chrome.runtime.lastError) {
          statusDiv.textContent = 'Error starting timer.';
          statusDiv.style.color = 'red';
        } else {
          chrome.runtime.sendMessage({ action: 'TIMER_STARTED' });
        }
      });
    });
  });

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'TIMER_STARTED') {
      startCountdown();
    }
  });
});