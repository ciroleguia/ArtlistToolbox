const ARTLIST_MUSIC_URL = "https://artlist.io/royalty-free-music";

const toggleCheckbox = document.getElementById("toggle-extension");
const searchOnlyCheckbox = document.getElementById("toggle-search-only");

// Load extension status
chrome.storage.local.get({ enabled: true, searchOnly: false }, (items) => {
  toggleCheckbox.checked = items.enabled;
  searchOnlyCheckbox.checked = items.searchOnly;
});

// Save extension status on change
toggleCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: toggleCheckbox.checked });
});

// Save download mode on change
searchOnlyCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ searchOnly: searchOnlyCheckbox.checked });
});

document.getElementById("open-artlist").addEventListener("click", () => {
  chrome.tabs.create({ url: ARTLIST_MUSIC_URL });
  window.close();
});
