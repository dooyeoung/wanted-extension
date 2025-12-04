// background.js
import Analytics from './ga.js';

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    Analytics.fireEvent('app_install');
  } else if (details.reason === 'update') {
    Analytics.fireEvent('app_update', { version: chrome.runtime.getManifest().version });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GA_EVENT') {
    Analytics.fireEvent(message.eventName, message.params);
    return;
  }

  if (message.type === 'FETCH_BLIND') {
    const company = message.company;
    const url = `https://www.teamblind.com/kr/company/${encodeURIComponent(company)}/reviews`;

    fetch(url)
      .then((res) => {
        if (res.ok) {
          return res.text();
        }
        const error = new Error(`HTTP error`);
        error.status = res.status;
        throw error;
      })
      .then((html) => {
        console.log(`[BACKGROUND] Fetched HTML for ${url} ${message.company}. HTML content (first 500 chars):`, html.substring(0, 500));
        sendResponse({ success: true, html });
      })
      .catch((err) => {
        if (err.status === 403) {
          console.error('[BACKGROUND] Forbidden error', err.status);
          sendResponse({ success: false, errorType: 'forbidden', status: err.status });
        }
        else if (err.status === 404) {
          // console.error('[BACKGROUND] Not Found error', err.status);
          sendResponse({ success: false, errorType: 'notfound', status: err.status });
        }
        else {
          console.error('[BACKGROUND] Network error', err);
          sendResponse({ success: false, errorType: 'network', error: err.message });
        }
      })

    return true; // 비동기 응답 허용
  }

  if (message.type === 'FETCH_WANTED_COMPANY_INFO') {
    const companyId = message.companyId;
    const url = `https://www.wanted.co.kr/company/${companyId}`;

    fetch(url)
      .then((res) => res.text())
      .then((html) => {
        // __NEXT_DATA__를 찾기 위해 HTML 파싱
        // 속성 순서에 상관없이 스크립트 태그와 일치하도록 유연한 정규식 사용
        const regex = /<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/;
        const match = html.match(regex);

        if (match && match[1]) {
          try {
            const nextData = JSON.parse(match[1]);
            // regNoHash 찾기 위해 순회
            // 경로: props.pageProps.dehydrateState.queries[].state.data.regNoHash
            // queries가 배열이므로 원하는 데이터가 있는 항목을 찾아야 할 수 있음.
            // 보통 첫 번째 항목이거나 검색 가능.

            let regNoHash = null;
            const queries = nextData?.props?.pageProps?.dehydrateState?.queries || [];

            for (const query of queries) {
              if (query?.state?.data?.regNoHash) {
                regNoHash = query.state.data.regNoHash;
                break;
              }
            }

            if (regNoHash) {
              console.log(`[BACKGROUND] Found regNoHash for ${companyId}: ${regNoHash}`);
              sendResponse({ success: true, regNoHash });
            } else {
              console.warn(`[BACKGROUND] regNoHash not found in JSON for ${companyId}`);
              sendResponse({ success: false, error: 'regNoHash not found in JSON' });
            }

          } catch (e) {
            console.error('[BACKGROUND] JSON parse error', e);
            sendResponse({ success: false, error: 'JSON parse error' });
          }
        } else {
          console.warn(`[BACKGROUND] __NEXT_DATA__ script not found for ${companyId}`);
          sendResponse({ success: false, error: '__NEXT_DATA__ script not found' });
        }
      })
      .catch((err) => {
        console.error('[BACKGROUND] fetch error', err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // 비동기 응답
  }

  if (message.type === 'FETCH_FINANCIAL_REPORT') {
    const regNoHash = message.regNoHash;
    const url = `https://insight.wanted.co.kr/api/company/${regNoHash}/financial-report-for-wanted`;

    fetch(url)
      .then((res) => res.json())
      .then((data) => {
        sendResponse({ success: true, data });
      })
      .catch((err) => {
        console.error('[BACKGROUND] fetch financial error', err);
        sendResponse({ success: false, error: err.message });
      });

    return true; // 비동기 응답
  }
});