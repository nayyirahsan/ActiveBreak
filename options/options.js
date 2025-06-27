// ActiveBreak settings page.
// Rep targets save automatically (debounced) to chrome.storage.local as
// `repTargets`; the break page reads them at break time.

const DEFAULTS = { jumping_jacks: 10, squats: 8, push_ups: 5 };
const MIN_REPS = 1;
const MAX_REPS = 50;

const inputs = [...document.querySelectorAll('input[data-exercise]')];
const saveStatus = document.getElementById('save-status');
let saveTimer = null;
let statusTimer = null;

init();

async function init() {
  const { repTargets } = await chrome.storage.local.get('repTargets');
  for (const input of inputs) {
    const key = input.dataset.exercise;
    input.value = clamp((repTargets && repTargets[key]) ?? DEFAULTS[key]);
    input.addEventListener('input', scheduleSave);
    input.addEventListener('blur', () => {
      input.value = clamp(input.value);
      scheduleSave();
    });
  }

  for (const btn of document.querySelectorAll('button[data-step]')) {
    btn.addEventListener('click', () => {
      const input = document.getElementById(`reps-${btn.dataset.target}`);
      input.value = clamp(Number(input.value) + Number(btn.dataset.step));
      scheduleSave();
    });
  }

  document.getElementById('restore-btn').addEventListener('click', () => {
    for (const input of inputs) {
      input.value = DEFAULTS[input.dataset.exercise];
    }
    save('Defaults restored');
  });
}

function clamp(value) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULTS.jumping_jacks;
  return Math.min(MAX_REPS, Math.max(MIN_REPS, n));
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save('Saved'), 300);
}

async function save(message) {
  clearTimeout(saveTimer);
  const repTargets = {};
  for (const input of inputs) {
    repTargets[input.dataset.exercise] = clamp(input.value);
  }
  await chrome.storage.local.set({ repTargets });
  saveStatus.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { saveStatus.textContent = ''; }, 2000);
}
