const ARTLIST_MUSIC_URL = "https://artlist.io/royalty-free-music";

document.getElementById("open-artlist").addEventListener("click", () => {
  chrome.tabs.create({ url: ARTLIST_MUSIC_URL });
  window.close();
});
