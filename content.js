/**
 * @file content.js
 * @description Wanted 채용 목록 페이지에서 회사 평점을 가져와 표시하는 Chrome 확장 프로그램의 Content Script
 */

// --- 유틸리티 함수 ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCompanyName(text) {
  return text.replace(/\s*\(.*?\)/g, '');
}

// --- API 모듈 ---
const BlindAPI = {
  parseRating: function(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const el = doc.querySelector('span.star');
    if (!el) return null;
    const match = el.textContent.match(/\d+(\.\d+)?/);
    return match ? match[0] : null;
  },
  fetchReview: function(companyName) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'FETCH_BLIND', company: companyName },
        (response) => {
          if (response?.success && response.html) {
            const rating = this.parseRating(response.html);
            resolve({ rating: rating || 'N/A' });
          } else {
            console.error(`Failed to fetch for ${companyName}:`, response?.error || 'Unknown error');
            resolve({ rating: 'N/A' });
          }
        }
      );
    });
  }
};

// --- UI 렌더링 모듈 (페이지 내 별점 표시) ---
const UIManager = {
  injectRating: function(element, rating, companyName) {
    if (element.querySelector('.blind-score')) return;
    const scoreSpan = document.createElement('div');
    scoreSpan.className = 'blind-score';
    scoreSpan.style.cssText = `padding-left: 4px; padding-top: 4px; color: #ffb400; font-size: 0.8125rem; font-weight: 500;`;
    scoreSpan.textContent = `★ ${rating}`;
    element.append(scoreSpan);
  }
};

// --- Drawer UI 관리 모듈 ---
const DrawerManager = {
  drawer: null, list: null, openButton: null, statusElement: null, items: [],
  sortState: { key: null, direction: 'desc' }, // 정렬 상태 관리

  create: function() {
    if (this.drawer) {
      this.drawer.style.display = 'flex';
      if(this.openButton) this.openButton.style.display = 'block';
      return;
    }

    // --- Drawer 본체 ---
    this.drawer = document.createElement('div');
    this.drawer.id = 'blind-rating-drawer';
    this.drawer.style.cssText = `position: fixed; top: 0; right: 0; width: 380px; height: 100%; background-color: white; border-left: 1px solid #e0e0e0; box-shadow: -2px 0 5px rgba(0,0,0,0.1); z-index: 9999; display: flex; flex-direction: column; padding: 10px; box-sizing: border-box;`;

    // --- 헤더 ---
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; flex-shrink: 0;';
    const title = document.createElement('h3');
    title.textContent = '블라인드 평점 수집';
    title.style.margin = '0';
    this.statusElement = document.createElement('span');
    this.statusElement.style.marginLeft = '10px';
    const titleGroup = document.createElement('div');
    titleGroup.style.cssText = 'display: flex; align-items: center;';
    titleGroup.appendChild(title); titleGroup.appendChild(this.statusElement);
    const buttonGroup = document.createElement('div');
    buttonGroup.innerHTML = `<button id="pause-scan" title="일시 정지">❚❚</button><button id="resume-scan" title="다시 시작" style="display: none;">▶</button><button id="close-drawer" title="닫기">X</button>`;
    buttonGroup.querySelectorAll('button').forEach(btn => btn.style.marginLeft = '5px');
    header.appendChild(titleGroup); header.appendChild(buttonGroup);

    // --- 테이블 헤더 (정렬 기능 추가) ---
    const tableHeader = document.createElement('div');
    tableHeader.style.cssText = `display: flex; font-weight: bold; padding: 5px 0; border-bottom: 1px solid #ccc; flex-shrink: 0; user-select: none;`;
    tableHeader.innerHTML = `
      <div id="sort-by-name" style="flex: 3; cursor: pointer;">회사명</div>
      <div id="sort-by-rating" style="flex: 1.5; text-align: center; cursor: pointer;">평점</div>
      <div style="flex: 2; text-align: center;">바로가기</div>
    `;
    tableHeader.querySelector('#sort-by-name').onclick = () => this.sortItems('name');
    tableHeader.querySelector('#sort-by-rating').onclick = () => this.sortItems('rating');

    this.list = document.createElement('div');
    this.list.style.cssText = `overflow-y: auto; flex-grow: 1;`;

    this.drawer.appendChild(header); this.drawer.appendChild(tableHeader); this.drawer.appendChild(this.list);
    document.body.appendChild(this.drawer);
    this.createOpenButton();
    if(this.openButton) this.openButton.style.display = 'block';
  },

  createOpenButton: function() {
    if (this.openButton) return;
    this.openButton = document.createElement('button');
    this.openButton.textContent = '결과 보기';
    this.openButton.style.cssText = `position: fixed; bottom: 20px; right: 20px; z-index: 9998; padding: 10px 15px; background-color: #0077cc; color: white; border: none; border-radius: 5px; cursor: pointer; display: none;`;
    this.openButton.onclick = () => { if (this.drawer) this.drawer.style.display = 'flex'; };
    document.body.appendChild(this.openButton);
  },

  updateStatus: function(status) {
    if (!this.statusElement) return;
    let text = '', color = 'black';
    if (status.type === 'progress') {
      text = `수집 현황: ${status.completed} / ${status.total}`;
      color = 'blue';
    } else {
      text = status.text;
      color = status.color;
    }
    this.statusElement.textContent = text;
    this.statusElement.style.color = color;
  },

  addItem: function(companyName) {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee;`;
    row.innerHTML = `<div style="flex: 3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${companyName}</div><div style="flex: 1.5; text-align: center;">대기 중...</div><div style="flex: 2; text-align: center;"></div>`;
    this.list.appendChild(row);
    this.items.push({ name: companyName, rating: null, element: row });
  },

  updateItem: function(companyName, rating) {
    const item = this.items.find(it => it.name === companyName);
    if (!item) return;
    item.rating = rating;
    const ratingCell = item.element.children[1];
    const linkCell = item.element.children[2];
    ratingCell.innerHTML = (rating !== 'N/A') ? `<span style="color: #ffb400; font-weight: bold;">★ ${rating}</span>` : 'N/A';
    if (linkCell.innerHTML === '') {
      const linkButton = document.createElement('button');
      linkButton.textContent = '리뷰 보기';
      linkButton.style.cssText = `color: #0077cc; text-decoration: underline; cursor: pointer; border: none; background: none; padding: 0;`;
      linkButton.onclick = () => window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(companyName)}/reviews`, '_blank');
      linkCell.appendChild(linkButton);
    }
  },

  updateSortIndicator: function() {
    const nameHeader = this.drawer.querySelector('#sort-by-name');
    const ratingHeader = this.drawer.querySelector('#sort-by-rating');
    nameHeader.textContent = '회사명';
    ratingHeader.textContent = '평점';

    const targetHeader = this.sortState.key === 'name' ? nameHeader : ratingHeader;
    const arrow = this.sortState.direction === 'asc' ? ' ▲' : ' ▼';
    targetHeader.textContent += arrow;
  },

  sortItems: function(key) {
    if (this.sortState.key === key) {
      this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortState.key = key;
      this.sortState.direction = key === 'rating' ? 'desc' : 'asc';
    }

    this.items.sort((a, b) => {
      const dir = this.sortState.direction === 'asc' ? 1 : -1;
      if (this.sortState.key === 'rating') {
        const ratingA = (a.rating && a.rating !== 'N/A') ? parseFloat(a.rating) : -1;
        const ratingB = (b.rating && b.rating !== 'N/A') ? parseFloat(b.rating) : -1;
        return (ratingB - ratingA) * dir;
      } else { // name
        return a.name.localeCompare(b.name) * dir;
      }
    });

    this.list.innerHTML = '';
    this.items.forEach(item => this.list.appendChild(item.element));
    this.updateSortIndicator();
  },

  clear: function() {
    if (this.list) this.list.innerHTML = '';
    this.items = [];
    this.sortState = { key: null, direction: 'desc' };
  }
};

// --- 메인 애플리케이션 모듈 ---
const JobScanner = {
  isScanning: false, isPaused: false, totalCompanies: 0, completedCompanies: 0,

  pause: function() {
    this.isPaused = true;
    DrawerManager.updateStatus({ text: '일시 정지', color: 'orange' });
    document.getElementById('pause-scan').style.display = 'none';
    document.getElementById('resume-scan').style.display = 'inline-block';
  },

  resume: function() {
    this.isPaused = false;
    DrawerManager.updateStatus({ type: 'progress', completed: this.completedCompanies, total: this.totalCompanies });
    document.getElementById('pause-scan').style.display = 'inline-block';
    document.getElementById('resume-scan').style.display = 'none';
  },

  startFullScan: async function() {
    if (this.isScanning) return;
    this.isScanning = true; this.isPaused = false; this.totalCompanies = 0; this.completedCompanies = 0;

    DrawerManager.create();
    DrawerManager.clear();
    DrawerManager.updateStatus({ type: 'progress', completed: 0, total: 0 });

    document.getElementById('pause-scan').onclick = () => this.pause();
    document.getElementById('resume-scan').onclick = () => this.resume();
    document.getElementById('close-drawer').onclick = () => DrawerManager.drawer.style.display = 'none';
    document.getElementById('resume-scan').style.display = 'none';
    document.getElementById('pause-scan').style.display = 'inline-block';

    const companyNames = new Set();
    const taskQueue = [];
    let producerDone = false;

    const consumer = async () => {
      while (!producerDone || taskQueue.length > 0) {
        while (this.isPaused) await sleep(1000);
        if (taskQueue.length > 0) {
          const name = taskQueue.shift();
          const { rating } = await BlindAPI.fetchReview(name);
          DrawerManager.updateItem(name, rating);
          this.completedCompanies++;
          DrawerManager.updateStatus({ type: 'progress', completed: this.completedCompanies, total: this.totalCompanies });
          await sleep(300);
        } else {
          await sleep(500);
        }
      }
      DrawerManager.updateStatus({ text: '수집 완료', color: 'green' });
      this.isScanning = false;
      document.getElementById('pause-scan').style.display = 'none';
      document.getElementById('resume-scan').style.display = 'none';
    };

    const producer = async () => {
      let lastHeight = 0, consecutiveNoChangeCount = 0;
      const MAX_NO_CHANGE_ATTEMPTS = 3;
      while (true) {
        while (this.isPaused) await sleep(1000);
        document.querySelectorAll('button[data-company-name]').forEach(button => {
          const name = extractCompanyName(button.getAttribute('data-company-name')).trim();
          if (name && !companyNames.has(name)) {
            companyNames.add(name);
            DrawerManager.addItem(name);
            taskQueue.push(name);
            this.totalCompanies++;
            DrawerManager.updateStatus({ type: 'progress', completed: this.completedCompanies, total: this.totalCompanies });
          }
        });
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(2000);
        const newHeight = document.body.scrollHeight;
        if (newHeight === lastHeight) {
          consecutiveNoChangeCount++;
          if (consecutiveNoChangeCount >= MAX_NO_CHANGE_ATTEMPTS) break;
        } else {
          consecutiveNoChangeCount = 0;
          lastHeight = newHeight;
        }
      }
      producerDone = true;
    };

    consumer();
    producer();
  },

  init: function() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'START_COLLECTING') {
        this.startFullScan();
      }
    });
  }
};

JobScanner.init();