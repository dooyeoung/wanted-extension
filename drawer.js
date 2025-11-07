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

    const drawerHtml = `
      <div id="blind-rating-drawer" style="position: fixed; top: 0; right: 0; width: 500px; height: 100%; background-color: white; border-left: 1px solid #e0e0e0; box-shadow: -2px 0 5px rgba(0,0,0,0.1); z-index: 9999; display: flex; flex-direction: column; padding: 10px; box-sizing: border-box;">
        <div style="flex-shrink: 0; height: 60px;">
          <span style="margin: 0 0 10px 0;">블라인드 평점 수집</span>
          <div style="display: flex; padding: 5px 0; border-bottom: 1px solid #ccc; flex-shrink: 0; user-select: none;">
            <div id="sort-by-name" style="flex: 4; cursor: pointer;">회사명</div>
            <div id="sort-by-rating" style="flex: 1; text-align: center; cursor: pointer;">평점</div>
            <div style="flex: 3; text-align: center;">바로가기</div>
          </div>
        </div>
        <div id="blind-rating-list" style="overflow-y: auto; flex-grow: 1;"></div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; flex-shrink: 0;">
          <span id="blind-rating-status"></span>
          <div>
            <button id="start-scan-in-drawer" style="padding: 5px 10px; font-size: 0.9em;">수집 시작</button>
            <button id="pause-scan" title="수집 정지" style="padding: 5px 10px; font-size: 0.9em; display: none;">수집 정지</button>
            <button id="resume-scan" title="다시 시작" style="padding: 5px 10px; font-size: 0.9em; display: none;">다시 시작</button>
            <button id="close-drawer" title="닫기">X</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', drawerHtml);
    this.drawer = document.getElementById('blind-rating-drawer');
    this.list = document.getElementById('blind-rating-list');
    this.statusElement = document.getElementById('blind-rating-status');

    // Attach event listeners
    this.drawer.querySelector('#sort-by-name').onclick = () => this.sortItems('name');
    this.drawer.querySelector('#sort-by-rating').onclick = () => this.sortItems('rating');
    this.drawer.querySelector('#start-scan-in-drawer').onclick = () => console.log('Start Scan Clicked'); // Placeholder
    this.drawer.querySelector('#pause-scan').onclick = () => console.log('Pause Scan Clicked'); // Placeholder
    this.drawer.querySelector('#resume-scan').onclick = () => console.log('Resume Scan Clicked'); // Placeholder
    this.drawer.querySelector('#close-drawer').onclick = () => this.hide(); // Assuming a hide method exists or will be added

    // Apply margin-left to buttons
    this.drawer.querySelectorAll('button').forEach(btn => btn.style.marginLeft = '5px');

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
    const itemHtml = `
      <div class="drawer-item-row" style="display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee;">
        <div class="drawer-item-name" style="flex: 4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${companyName}</div>
        <div class="drawer-item-rating" style="flex: 1; text-align: center;">대기 중...</div>
        <div class="drawer-item-links" style="flex: 3; text-align: center;">
          <button class="blind-link-button" data-company="${companyName}" style="color: #0077cc; text-decoration: underline; cursor: pointer; border: none; background: none; padding: 0;">리뷰 보기</button>
          <button class="jobkorea-link-button" data-company="${companyName}" style="color: #0077cc; text-decoration: underline; cursor: pointer; border: none; background: none; padding: 0; margin-left: 8px;">잡코리아 정보 보기</button>
        </div>
      </div>
    `;
    this.list.insertAdjacentHTML('beforeend', itemHtml);
    const newRow = this.list.lastElementChild; // Get the newly added row
    const blindLinkButton = newRow.querySelector('.blind-link-button');
    const jobKoreaLinkButton = newRow.querySelector('.jobkorea-link-button');

    if (blindLinkButton) {
      blindLinkButton.onclick = () => window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');
    }
    if (jobKoreaLinkButton) {
      jobKoreaLinkButton.onclick = () => window.open(`https://www.jobkorea.co.kr/Search/?stext=${encodeURIComponent(extractCompanyName(companyName))}&tabType=corp&Page_No=1`, '_blank');
    }

    this.items.push({ name: companyName, rating: null, element: newRow });
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