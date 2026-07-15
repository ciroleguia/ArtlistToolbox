const ARTLIST_MUSIC_URL = "https://artlist.io/royalty-free-music";

const toggleCheckbox = document.getElementById("toggle-extension");

// Load extension status
chrome.storage.local.get({ enabled: true }, (items) => {
  toggleCheckbox.checked = items.enabled;
});

// Save extension status on change
toggleCheckbox.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: toggleCheckbox.checked });
});

document.getElementById("open-artlist").addEventListener("click", () => {
  chrome.tabs.create({ url: ARTLIST_MUSIC_URL });
  window.close();
});
