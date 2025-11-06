document.getElementById('autoDisplay').addEventListener('change', e => {
  chrome.storage.sync.set({ autoDisplay: e.target.checked });
});
