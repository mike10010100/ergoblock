// src/types.ts
var DEFAULT_OPTIONS = {
  defaultDuration: 864e5,
  // 24 hours
  quickBlockDuration: 36e5,
  // 1 hour
  notificationsEnabled: true,
  notificationSound: false,
  checkInterval: 1,
  showBadgeCount: true,
  theme: "auto"
};

// src/storage.ts
var STORAGE_KEYS = {
  TEMP_BLOCKS: "tempBlocks",
  TEMP_MUTES: "tempMutes",
  OPTIONS: "extensionOptions",
  ACTION_HISTORY: "actionHistory"
};
var DEFAULT_DURATION_MS = 24 * 60 * 60 * 1e3;
async function getOptions() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.OPTIONS);
  return result[STORAGE_KEYS.OPTIONS] || DEFAULT_OPTIONS;
}
async function setOptions(options) {
  await chrome.storage.local.set({ [STORAGE_KEYS.OPTIONS]: options });
}

// src/options.ts
var defaultDurationSelect = document.getElementById("defaultDuration");
var quickBlockDurationSelect = document.getElementById("quickBlockDuration");
var notificationsEnabledCheckbox = document.getElementById(
  "notificationsEnabled"
);
var notificationSoundCheckbox = document.getElementById("notificationSound");
var showBadgeCountCheckbox = document.getElementById("showBadgeCount");
var checkIntervalRange = document.getElementById("checkInterval");
var intervalValueSpan = document.getElementById("intervalValue");
var saveBtn = document.getElementById("saveBtn");
var resetBtn = document.getElementById("resetBtn");
var statusDiv = document.getElementById("status");
async function loadOptions() {
  const options = await getOptions();
  defaultDurationSelect.value = options.defaultDuration.toString();
  quickBlockDurationSelect.value = options.quickBlockDuration.toString();
  notificationsEnabledCheckbox.checked = options.notificationsEnabled;
  notificationSoundCheckbox.checked = options.notificationSound;
  showBadgeCountCheckbox.checked = options.showBadgeCount;
  checkIntervalRange.value = options.checkInterval.toString();
  intervalValueSpan.textContent = options.checkInterval.toString();
  const themeRadio = document.querySelector(
    `input[name="theme"][value="${options.theme}"]`
  );
  if (themeRadio) {
    themeRadio.checked = true;
  }
}
checkIntervalRange.addEventListener("input", () => {
  intervalValueSpan.textContent = checkIntervalRange.value;
});
async function saveOptions() {
  const selectedTheme = document.querySelector('input[name="theme"]:checked')?.value || "auto";
  const options = {
    defaultDuration: parseInt(defaultDurationSelect.value, 10),
    quickBlockDuration: parseInt(quickBlockDurationSelect.value, 10),
    notificationsEnabled: notificationsEnabledCheckbox.checked,
    notificationSound: notificationSoundCheckbox.checked,
    showBadgeCount: showBadgeCountCheckbox.checked,
    checkInterval: parseInt(checkIntervalRange.value, 10),
    theme: selectedTheme
  };
  await setOptions(options);
  showStatus("Settings saved successfully!", "success");
}
async function resetOptions() {
  if (confirm("Reset all settings to defaults?")) {
    await setOptions(DEFAULT_OPTIONS);
    await loadOptions();
    showStatus("Settings reset to defaults", "success");
  }
}
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status-message show ${type}`;
  setTimeout(() => {
    statusDiv.classList.remove("show");
  }, 3e3);
}
saveBtn.addEventListener("click", saveOptions);
resetBtn.addEventListener("click", resetOptions);
loadOptions().catch((error) => {
  console.error("[ErgoBlock] Failed to load options:", error);
  showStatus("Failed to load settings", "error");
});
