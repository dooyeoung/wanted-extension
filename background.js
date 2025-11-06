// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'FETCH_BLIND') {
    const company = message.company;
    const url = `https://www.teamblind.com/kr/company/${encodeURIComponent(company)}/reviews`;

    fetch(url)
      .then((res) => res.text())
      .then((html) => {
        console.log('[BACKGROUND] fetched HTML for', message.company);
        sendResponse({ success: true, html });
      })
      .catch((err) => {
        console.error('[BACKGROUND] fetch error', err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // 비동기 응답 허용
  }
});