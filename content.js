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

function getRatingColor(rating) {
  const numericRating = parseFloat(rating);
  if (numericRating >= 4.0) return 'red';
  if (numericRating >= 3.0) return 'orange';
  return 'gray';
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
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'blind-score';
    scoreDiv.style.cssText = `padding-left: 4px; padding-top: 4px; font-size: 0.8125rem; font-weight: 500; display: flex; align-items: center;`;
    const ratingSpan = document.createElement('span');
    const color = getRatingColor(rating);
    ratingSpan.style.cssText = `color: ${color}; margin-right: 4px;`;
    ratingSpan.textContent = `★ ${rating}`;
    scoreDiv.appendChild(ratingSpan);
    const linkButton = document.createElement('button');
    linkButton.textContent = '리뷰 보기';
    linkButton.style.cssText = `color: #0077cc; text-decoration: underline; cursor: pointer; border: none; background: none; padding: 0; font-size: 1em;`;
    linkButton.onclick = (e) => {
      e.stopPropagation(); e.preventDefault();
      window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');
    };
    scoreDiv.appendChild(linkButton);
    element.append(scoreDiv);
  }
};

// --- Drawer UI 관리 모듈 ---
const DrawerManager = {
  drawer: null, list: null, openButton: null, statusElement: null, items: [],
  sortState: { key: null, direction: 'desc' },
  latestStatus: { type: 'progress', completed: 0, total: 0 },

  create: function() {
    if (this.drawer) {
      this.drawer.style.display = 'flex';
      if(this.openButton) this.openButton.style.display = 'block';
      return;
    }
    this.drawer = document.createElement('div');
    this.drawer.id = 'blind-rating-drawer';
    this.drawer.style.cssText = `position: fixed; top: 0; right: 0; width: 380px; height: 100%; background-color: white; border-left: 1px solid #e0e0e0; box-shadow: -2px 0 5px rgba(0,0,0,0.1); z-index: 9999; display: flex; flex-direction: column; padding: 10px; box-sizing: border-box;`;
    const header = document.createElement('div');
    header.style.cssText = 'flex-shrink: 0; height: 60px;';
    const title = document.createElement('span');
    title.textContent = '블라인드 평점 수집';
    title.style.margin = '0 0 10px 0';
    header.appendChild(title);
    const tableHeader = document.createElement('div');
    tableHeader.style.cssText = `display: flex; padding: 5px 0; border-bottom: 1px solid #ccc; flex-shrink: 0; user-select: none;`;
    tableHeader.innerHTML = `<div id="sort-by-name" style="flex: 3; cursor: pointer;">회사명</div><div id="sort-by-rating" style="flex: 1.5; text-align: center; cursor: pointer;">평점</div><div style="flex: 2; text-align: center;">바로가기</div>`;
    header.appendChild(tableHeader);
    this.list = document.createElement('div');
    this.list.style.cssText = `overflow-y: auto; flex-grow: 1;`;
    const footer = document.createElement('div');
    footer.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-top: 10px; flex-shrink: 0;';
    this.statusElement = document.createElement('span');
    const buttonGroup = document.createElement('div');
    buttonGroup.innerHTML = `
      <button id="start-scan-in-drawer" style="padding: 5px 10px; font-size: 0.9em;">수집 시작</button>
      <button id="pause-scan" title="수집 정지" style="padding: 5px 10px; font-size: 0.9em; display: none;">수집 정지</button>
      <button id="resume-scan" title="다시 시작" style="padding: 5px 10px; font-size: 0.9em; display: none;">다시 시작</button>
      <button id="close-drawer" title="닫기">X</button>
    `;
    buttonGroup.querySelectorAll('button').forEach(btn => btn.style.marginLeft = '5px');
    footer.appendChild(this.statusElement);
    footer.appendChild(buttonGroup);
    this.drawer.appendChild(header); 
    this.drawer.appendChild(this.list);
    this.drawer.appendChild(footer);
    document.body.appendChild(this.drawer);

    this.drawer.querySelector('#sort-by-name').onclick = () => this.sortItems('name');
    this.drawer.querySelector('#sort-by-rating').onclick = () => this.sortItems('rating');

    this.createOpenButton();
  },

  createOpenButton: function() {
    if (this.openButton) return;
    this.openButton = document.createElement('button');
    this.openButton.textContent = '결과 보기';
    this.openButton.style.cssText = `position: fixed; bottom: 20px; right: 20px; z-index: 9998; padding: 10px 15px; background-color: #0077cc; color: white; border: none; border-radius: 5px; cursor: pointer; display: none;`;
    this.openButton.onclick = () => {
      if (this.drawer) this.drawer.style.display = 'flex';
      this.updateButtonAndStatusDisplay();
    };
    document.body.appendChild(this.openButton);
  },

  formatStatusText: function(status) {
    if (status.type === 'progress') {
      return `수집 현황: ${status.completed} / ${status.total}`;
    } else {
      return status.text;
    }
  },

  updateButtonAndStatusDisplay: function() {
    if (!this.drawer || !this.openButton) return;
    const statusText = this.formatStatusText(this.latestStatus);
    const statusColor = this.latestStatus.color || 'blue';
    if (this.drawer.style.display === 'none') {
      this.openButton.style.display = 'block';
      this.openButton.textContent = `결과 보기 (${statusText})`;
      this.statusElement.textContent = '';
    } else {
      this.openButton.style.display = 'none';
      this.openButton.textContent = '결과 보기';
      this.statusElement.textContent = statusText;
      this.statusElement.style.color = statusColor;
    }
  },

  updateStatus: function(status) {
    this.latestStatus = status;
    this.updateButtonAndStatusDisplay();
  },

  addItem: function(companyName) {
    const row = document.createElement('div');
    row.style.cssText = `display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee;`;
    const nameCell = document.createElement('div');
    nameCell.style.cssText = 'flex: 3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;';
    nameCell.textContent = companyName;
    const ratingCell = document.createElement('div');
    ratingCell.style.cssText = 'flex: 1.5; text-align: center;';
    ratingCell.textContent = '대기 중...';
    const linkCell = document.createElement('div');
    linkCell.style.cssText = 'flex: 2; text-align: center;';

    // 리뷰 보기 버튼을 addItem 시점에 추가
    const linkButton = document.createElement('button');
    linkButton.textContent = '리뷰 보기';
    linkButton.style.cssText = `color: #0077cc; text-decoration: underline; cursor: pointer; border: none; background: none; padding: 0;`;
    linkButton.onclick = () => window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');
    linkCell.appendChild(linkButton);

    row.appendChild(nameCell); row.appendChild(ratingCell); row.appendChild(linkCell);
    this.list.appendChild(row);
    this.items.push({ name: companyName, rating: null, element: row });
  },

  updateItem: function(companyName, rating) {
    const item = this.items.find(it => it.name === companyName);
    if (!item) return;
    item.rating = rating;
    const ratingCell = item.element.children[1];
    // updateItem에서는 평점 셀만 업데이트
    if (rating !== 'N/A') {
      const color = getRatingColor(rating);
      ratingCell.innerHTML = `<span style="color: ${color}; font-weight: bold;">★ ${rating}</span>`;
    } else {
      ratingCell.innerHTML = 'N/A';
    }
  },

  updateSortIndicator: function() {
    if (!this.drawer) return; // 오류 방지 가드 추가
    const nameHeader = this.drawer.querySelector('#sort-by-name');
    const ratingHeader = this.drawer.querySelector('#sort-by-rating');
    nameHeader.textContent = '회사명';
    ratingHeader.textContent = '평점';
    if (!this.sortState.key) return;
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
        return (ratingA - ratingB) * dir;
      } else {
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
    this.updateSortIndicator();
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
    
    DrawerManager.updateStatus({ type: 'progress', completed: 0, total: 0 });

    document.getElementById('start-scan-in-drawer').style.display = 'none';
    document.getElementById('pause-scan').style.display = 'inline-block';
    document.getElementById('resume-scan').style.display = 'none';

    const companyNames = new Set();
    const taskQueue = [];
    let producerDone = false;

    const consumer = async () => {
      while (!producerDone || taskQueue.length > 0) {
        while (this.isPaused) await sleep(1000);

        if (taskQueue.length > 0) {
          const batchToProcess = taskQueue.splice(0, 1);
          const batchPromises = batchToProcess.map(name => 
            BlindAPI.fetchReview(extractCompanyName(name)).then(result => {
              const { rating } = result;
              DrawerManager.updateItem(name, rating);
              if (rating !== 'N/A') {
                document.querySelectorAll(`button[data-company-name="${name}"]`).forEach(button => {
                  const container = button.parentElement.parentElement;
                  UIManager.injectRating(container, rating, name);
                });
              }
              this.completedCompanies++;
              DrawerManager.updateStatus({ type: 'progress', completed: this.completedCompanies, total: this.totalCompanies });
            })
          );
          await Promise.all(batchPromises);
          await sleep(100);
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
          const name = button.getAttribute('data-company-name');
          if (name && !companyNames.has(name)) {
            companyNames.add(name);
            DrawerManager.addItem(name);
            taskQueue.push(name);
            this.totalCompanies++;
            DrawerManager.updateStatus({ type: 'progress', completed: this.completedCompanies, total: this.totalCompanies });
          }
        });
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(200);
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
      if (request.type === 'SHOW_DRAWER') {
        DrawerManager.create();
        DrawerManager.clear();
        DrawerManager.updateStatus({ text: '대기 중', color: 'gray'});
         // 버튼 이벤트 핸들러 설정
        document.getElementById('start-scan-in-drawer').onclick = () => this.startFullScan();
        document.getElementById('pause-scan').onclick = () => this.pause();
        document.getElementById('resume-scan').onclick = () => this.resume();
        document.getElementById('close-drawer').onclick = () => {
          DrawerManager.drawer.style.display = 'none';
          DrawerManager.updateButtonAndStatusDisplay();
        };
        // 초기 버튼 상태 설정
        document.getElementById('start-scan-in-drawer').style.display = 'inline-block';
        document.getElementById('pause-scan').style.display = 'none';
        document.getElementById('resume-scan').style.display = 'none';
      }
    });
  }
};

JobScanner.init();
