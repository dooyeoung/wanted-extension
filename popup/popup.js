document.getElementById('autoDisplay').addEventListener('change', e => {
  chrome.storage.sync.set({ autoDisplay: e.target.checked });
});

document.getElementById('start-scan').addEventListener('click', () => {
  console.log('Popup: Start Scan button clicked. Sending message...');
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      console.error('Popup: No active tab found.');
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: 'START_COLLECTING' });
  });
});
