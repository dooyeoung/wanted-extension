function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCompanyName(text) {
  return text.replace(/\s*\(.*?\)/g, '');
}
   

// --- Blind API 관련 모듈 ---

const BlindAPI = {
  /**
   * HTML 문자열에서 별점을 파싱합니다.
   * @param {string} html - Blind 페이지의 HTML
   * @returns {string|null} - 파싱된 별점 또는 null
   */
  parseRating: function(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const el = doc.querySelector('span.star');
    if (!el) return null;
    const match = el.textContent.match(/\d+(\.\d+)?/);
    return match ? match[0] : null;
  },

  /**
   * 백그라운드 스크립트를 통해 Blind 리뷰 정보를 가져옵니다.
   * @param {string} companyName - 조회할 회사 이름
   * @returns {Promise<{rating: string}|null>} - {별점} 객체 또는 null
   */
  fetchReview: function(companyName) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'FETCH_BLIND', company: companyName },
        (response) => {
          if (response?.success && response.html) {
            const rating = this.parseRating(response.html);
            if (!rating) {
              resolve(null);
              return;
            }
            resolve({ rating });
          } else {
            // 요청 실패 시 에러 로그 추가
            console.error(`Failed to fetch rating for ${companyName}:`, response?.error || 'Unknown error');
            resolve(null);
          }
        }
      );
    });
  }
};


// --- UI 렌더링 관련 모듈 ---

const UIManager = {
  /**
   * 지정된 요소에 별점과 리뷰 보기 버튼을 삽입합니다.
   * @param {HTMLElement} element - 별점을 삽입할 부모 요소
   * @param {string} rating - 표시할 별점
   * @param {string} companyName - 회사 이름 (리뷰 보기 링크에 사용)
   */
  injectRating: function(element, rating, companyName) {
    // 이미 별점 요소가 있으면 업데이트만 수행
    const existingScore = element.querySelector('.blind-score');
    if (existingScore) {
      const starText = existingScore.querySelector('span');
      if (starText && starText.textContent !== rating) {
        starText.textContent = rating;
      }
      return;
    }

    const scoreSpan = document.createElement('div');
    scoreSpan.className = 'blind-score';
    scoreSpan.style.cssText = `
      padding-left: 4px;
      padding-top: 4px;
      color: #ffb400;
      font-size: 0.8125rem;
      line-height: 1.125rem;
      font-weight: 500;
    `;

    // 별점 텍스트
    const starText = document.createElement('span');
    starText.textContent = `★ ${rating}`;
    scoreSpan.appendChild(starText);

    // 리뷰 보기 버튼
    const link = document.createElement('button');
    link.textContent = '리뷰 보기';
    link.style.cssText = `
      margin-left: 4px;
      color: #0077cc;
      font-weight: bold;
      text-decoration: underline;
      cursor: pointer;
      border: none;
      background: none;
      padding: 0;
    `;
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(companyName)}/reviews`, '_blank');
    });
    scoreSpan.appendChild(link);

    element.append(scoreSpan);
  }
};


// --- Drawer UI 관련 모듈 ---

const DrawerManager = {
  drawer: null,
  list: null,
  openButton: null,

  createOpenButton: function() {
    if (this.openButton) return;

    this.openButton = document.createElement('button');
    this.openButton.textContent = '결과 보기';
    this.openButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 9998;
      padding: 10px 15px;
      background-color: #0077cc;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      display: none; /* 초기에는 숨김 */
    `;
    this.openButton.onclick = () => {
      if (this.drawer) this.drawer.style.display = 'flex';
    };
    document.body.appendChild(this.openButton);
  },

  create: function() {
    this.createOpenButton(); // 열기 버튼 생성

    if (this.drawer) {
      this.drawer.style.display = 'flex';
      this.openButton.style.display = 'block'; // 스캔 시작 시 열기 버튼 표시
      return;
    }

    this.drawer = document.createElement('div');
    this.drawer.id = 'blind-rating-drawer';
    this.drawer.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      width: 300px;
      height: 100%;
      background-color: white;
      border-left: 1px solid #e0e0e0;
      box-shadow: -2px 0 5px rgba(0,0,0,0.1);
      z-index: 9999;
      display: flex; /* flexbox 레이아웃 사용 */
      flex-direction: column;
      padding: 10px;
      box-sizing: border-box;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;';

    const title = document.createElement('h3');
    title.textContent = '블라인드 평점 수집 결과';
    title.style.margin = '0';

    const closeButton = document.createElement('button');
    closeButton.textContent = '닫기';
    closeButton.onclick = () => this.drawer.style.display = 'none';

    header.appendChild(title);
    header.appendChild(closeButton);

    this.list = document.createElement('ul');
    this.list.style.cssText = `
      list-style: none;
      padding: 0;
      margin: 0;
      overflow-y: auto;
      flex-grow: 1;
    `;

    this.drawer.appendChild(header);
    this.drawer.appendChild(this.list);
    document.body.appendChild(this.drawer);
    
    this.openButton.style.display = 'block'; // Drawer 생성 후 열기 버튼 표시
  },

  addItem: function(companyName) {
    const item = document.createElement('li');
    item.id = `drawer-item-${companyName}`;
    item.textContent = `${companyName}: 수집 중...`;
    item.style.padding = '5px 0';
    this.list.appendChild(item);
  },

  updateItem: function(companyName, rating) {
    const item = document.getElementById(`drawer-item-${companyName}`);
    if (item) {
      item.innerHTML = `${companyName}: <span style="color: #ffb400; font-weight: bold;">★ ${rating}</span>`;
    }
  },

  clear: function() {
    if (this.list) {
      this.list.innerHTML = '';
    }
  }
};


/**
 * 여러 Promise를 동시성(concurrency) 제한을 두고 실행하는 클래스
 */
class PromisePool {
  constructor(concurrency = 5) {
    this.concurrency = concurrency;
    this.active = 0;
    this.queue = [];
  }

  add(task) {
    return new Promise((resolve, reject) => {
      const wrappedTask = () => task().then(resolve, reject);
      this.queue.push(wrappedTask);
      this.run();
    });
  }

  run() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      this.active++;
      const task = this.queue.shift();
      task().finally(() => {
        this.active--;
        this.run();
      });
    }
  }
}


// --- 메인 애플리케이션 모듈 ---

const JobScanner = {
  scoreCache: {}, // 회사별 평점 캐시
  isScanning: false,

  /**
   * 특정 채용 공고 카드에서 회사 이름을 찾아 평점을 가져오고 UI에 삽입합니다.
   * @param {HTMLElement} jobCardNode - 채용 공고 카드 최상위 노드
   */
  processJobCard: async function(jobCardNode) {
    const button = jobCardNode.querySelector('button[data-company-name]');
    if (!button) return;

    const companyNameRaw = button.getAttribute('data-company-name');
    const companyName = extractCompanyName(companyNameRaw);
    const container = button.parentElement.parentElement;

    // 캐시 확인 및 API 호출
    if (!this.scoreCache.hasOwnProperty(companyName)) {
      this.scoreCache[companyName] = null; // API 호출 중임을 표시
      const result = await BlindAPI.fetchReview(companyName);
      if (result) {
        this.scoreCache[companyName] = result.rating;
      }
    }
    
    // UI에 별점 삽입
    const rating = this.scoreCache[companyName];
    if (rating) {
      UIManager.injectRating(container, rating, companyName);
    }
    
    await sleep(100); // API 호출 부하를 줄이기 위한 지연
  },

  /**
   * 전체 페이지를 스크롤하며 모든 회사 이름을 수집하고, 평점을 동시성 제어하여 조회합니다.
   */
  startFullScan: async function() {
    if (this.isScanning) return;
    this.isScanning = true;

    DrawerManager.create();
    DrawerManager.clear();

    const companyNames = new Set();
    let lastHeight = 0;
    let consecutiveNoChangeCount = 0;
    const MAX_NO_CHANGE_ATTEMPTS = 3;

    console.log("Starting full scan in stable, sequential mode...");

    // 1. 스크롤하며 모든 회사 이름 수집
    while (true) {
      document.querySelectorAll('button[data-company-name]').forEach(button => {
        const name = extractCompanyName(button.getAttribute('data-company-name')).trim();
        if (name && !companyNames.has(name)) {
          companyNames.add(name);
          DrawerManager.addItem(name);
        }
      });

      window.scrollTo(0, document.body.scrollHeight);
      await sleep(2000);

      const newHeight = document.body.scrollHeight;
      if (newHeight === lastHeight) {
        consecutiveNoChangeCount++;
        if (consecutiveNoChangeCount >= MAX_NO_CHANGE_ATTEMPTS) {
          break;
        }
      } else {
        consecutiveNoChangeCount = 0;
        lastHeight = newHeight;
      }
    }

    // 2. 가장 안정적인 방식으로 하나씩, 시간 간격을 두고 조회
    const companyNamesArray = Array.from(companyNames);
    for (const name of companyNamesArray) {
      const result = await BlindAPI.fetchReview(name);
      const rating = result ? result.rating : 'N/A';
      DrawerManager.updateItem(name, rating);
      await sleep(300); // 각 요청 사이에 300ms 지연 추가
    }

    console.log("Full scan completed.");
    this.isScanning = false;
  },

  /**
   * MutationObserver 콜백: 동적으로 추가되는 채용 공고를 처리합니다.
   * @param {MutationRecord[]} mutationList - 변경 사항 목록
   */
  handleMutation: function(mutationList) {
    for (const mutation of mutationList) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          // node가 HTMLElement인지 확인
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processJobCard(node);
          }
        });
      }
    }
  },

  /**
   * 애플리케이션을 초기화하고 실행합니다.
   */
  init: function() {
    // 메시지 리스너 설정
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      console.log('Content Script: Message received', request);
      if (request.type === 'START_COLLECTING') {
        this.startFullScan();
      }
    });

    const url = window.location.href;
    
    // 채용 목록 페이지에서만 실행
    if (url.includes('/wdlistㄹㄹㄹㄹㄹ')) {
      // 1. 이미 로드된 채용 공고 처리
      document.querySelectorAll('ul[data-cy="job-list"] > li').forEach(jobCard => {
        this.processJobCard(jobCard);
      });

      // 2. 동적으로 로드되는 채용 공고를 감시할 Observer 설정
      const targetNode = document.querySelector('ul[data-cy="job-list"]');
      if (targetNode) {
        const observer = new MutationObserver(this.handleMutation.bind(this));
        observer.observe(targetNode, {
          childList: true,
          subtree: false 
        });
      }
    }
  }
};

JobScanner.init();
