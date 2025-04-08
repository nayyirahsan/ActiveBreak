// Store the current exercise for the next break
let currentExercise = 'random';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'START_TIMER') {
    const { timer, exercise } = message;
    currentExercise = exercise || 'random';
    // Clear any existing alarms
    chrome.alarms.clearAll(() => {
      // Set a new alarm
      chrome.alarms.create('activebreak_alarm', { delayInMinutes: timer });
      // Store the exercise and next break time
      const nextBreakTime = Date.now() + timer * 60 * 1000;
      chrome.storage.sync.set({ currentExercise, nextBreakTime });
      sendResponse({ status: 'ok' });
    });
    // Indicate async response
    return true;
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'activebreak_alarm') {
    // Clear nextBreakTime
    chrome.storage.sync.remove('nextBreakTime');
    // Get the exercise to assign
    chrome.storage.sync.get(['currentExercise'], (data) => {
      const exercise = data.currentExercise || 'random';
      // Set breakActive true and store exercise
      chrome.storage.sync.set({ breakActive: true, breakExercise: exercise }, () => {
        // Send a message to all tabs to trigger the overlay
        chrome.tabs.query({}, (tabs) => {
          for (const tab of tabs) {
            if (tab.id) {
              chrome.tabs.sendMessage(tab.id, { action: 'SHOW_OVERLAY', exercise, blockAll: true });
            }
          }
        });
      });
    });
  }
});

// Listen for break completion from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'BREAK_COMPLETE') {
    chrome.storage.sync.set({ breakActive: false }, () => {
      sendResponse({ status: 'ok' });
    });
    return true;
  }
}); 