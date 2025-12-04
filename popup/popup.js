document.getElementById('start-scan').addEventListener('click', () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) {
      console.error('Popup: No active tab found.');
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { type: 'SHOW_DRAWER' });
    window.close(); // 팝업 닫기
  });
});
