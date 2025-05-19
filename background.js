// ActiveBreak background service worker.
// Owns the alarm lifecycle, the shared break state in chrome.storage.local,
// and the dedicated break tab where pose detection runs.

const ALARM_NAME = 'activebreak';
const EXERCISES = ['jumping_jacks', 'squats', 'push_ups'];
const BREAK_URL = chrome.runtime.getURL('break/break.html');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_TIMER') {
    startTimer(message.interval, message.exercise).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === 'STOP_TIMER') {
    stopTimer().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === 'BREAK_COMPLETE') {
    finishBreak(message).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (message.action === 'FOCUS_BREAK_TAB') {
    focusBreakTab().then(() => sendResponse({ ok: true }));
    return true;
  }
});

// If the browser restarts mid-break, bring the break tab back.
chrome.runtime.onStartup.addListener(async () => {
  const { breakActive } = await chrome.storage.local.get('breakActive');
  if (breakActive) await openBreakTab();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  const { exercise = 'random' } = await chrome.storage.local.get('exercise');
  const resolved = exercise === 'random'
    ? EXERCISES[Math.floor(Math.random() * EXERCISES.length)]
    : exercise;
  await chrome.storage.local.set({
    breakActive: true,
    breakExercise: resolved,
    nextBreakTime: null
  });
  await openBreakTab();
  broadcast({ action: 'SHOW_OVERLAY', exercise: resolved });
});

// Re-open the break tab if the user closes it mid-break — the break is enforced.
// (The break page itself offers a "Skip this break" escape hatch.)
chrome.tabs.onRemoved.addListener(async (tabId) => {
  const [{ breakTabId }, { breakActive }] = await Promise.all([
    chrome.storage.session.get('breakTabId'),
    chrome.storage.local.get('breakActive')
  ]);
  if (breakActive && tabId === breakTabId) await openBreakTab();
});

async function startTimer(interval, exercise) {
  await chrome.alarms.clearAll();
  await closeBreakTab();
  await chrome.storage.local.set({
    interval,
    exercise,
    breakActive: false,
    nextBreakTime: Date.now() + interval * 60 * 1000
  });
  await chrome.alarms.create(ALARM_NAME, { delayInMinutes: interval });
}

async function stopTimer() {
  await chrome.alarms.clearAll();
  await chrome.storage.local.remove('breakProgress');
  await chrome.storage.local.set({ breakActive: false, nextBreakTime: null });
  await closeBreakTab();
  broadcast({ action: 'HIDE_OVERLAY' });
}

// Break finished (or skipped): record today's stats, unlock every tab,
// and re-arm the timer for the next round.
async function finishBreak({ reps = 0, skipped = false } = {}) {
  const { interval, stats } = await chrome.storage.local.get(['interval', 'stats']);
  const updates = { breakActive: false };
  if (!skipped) {
    const today = new Date().toISOString().slice(0, 10);
    const s = stats && stats.date === today ? stats : { date: today, breaks: 0, reps: 0 };
    s.breaks += 1;
    s.reps += reps;
    updates.stats = s;
  }
  if (interval) {
    await chrome.alarms.create(ALARM_NAME, { delayInMinutes: interval });
    updates.nextBreakTime = Date.now() + interval * 60 * 1000;
  }
  await chrome.storage.local.remove('breakProgress');
  await chrome.storage.local.set(updates);
  await closeBreakTab();
  broadcast({ action: 'HIDE_OVERLAY' });
}

async function openBreakTab() {
  const existing = await findBreakTab();
  if (existing) {
    await focusTab(existing);
    return;
  }
  const tab = await chrome.tabs.create({ url: BREAK_URL, active: true });
  await chrome.storage.session.set({ breakTabId: tab.id });
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
}

async function focusBreakTab() {
  const existing = await findBreakTab();
  if (existing) {
    await focusTab(existing);
  } else {
    await openBreakTab();
  }
}

async function focusTab(tab) {
  await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
  await chrome.windows.update(tab.windowId, { focused: true }).catch(() => {});
}

// Track the break tab by id in session storage (survives service-worker
// restarts) — querying tabs by URL would require the "tabs" permission.
async function findBreakTab() {
  const { breakTabId } = await chrome.storage.session.get('breakTabId');
  if (breakTabId === undefined) return null;
  return chrome.tabs.get(breakTabId).catch(() => null);
}

async function closeBreakTab() {
  const tab = await findBreakTab();
  await chrome.storage.session.remove('breakTabId');
  if (tab) await chrome.tabs.remove(tab.id).catch(() => {});
}

function broadcast(message) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id !== undefined) {
        // Tabs without our content script (chrome://, web store, etc.) reject — ignore.
        chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  });
}
