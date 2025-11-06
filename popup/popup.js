document.getElementById('autoDisplay').addEventListener('change', e => {
  chrome.storage.sync.set({ autoDisplay: e.target.checked });
});

document.getElementById('start-scan').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { type: 'START_COLLECTING' });
  });
});
