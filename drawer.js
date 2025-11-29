// --- Drawer UI 관리 모듈 ---
const DrawerManager = {
  drawer: null, list: null, openButton: null, statusElement: null, items: [],
  sortState: { key: null, direction: 'desc' },
  latestStatus: { type: 'progress', completed: 0, total: 0 },
  isFullHidden: false,

  hide: function () {
    this.isFullHidden = false;
    if (this.drawer) this.drawer.style.display = 'none';
    if (this.openButton) this.openButton.style.display = 'block';
  },
  hideFull: function () {
    this.isFullHidden = true;
    if (this.drawer) this.drawer.style.display = 'none';
    if (this.openButton) this.openButton.style.display = 'none';
  },
  show: function () {
    this.isFullHidden = false;
    if (this.drawer) this.drawer.style.display = 'flex';
    if (this.openButton) this.openButton.style.display = 'none';
  },
  create: function () {
    if (this.drawer) {
      this.drawer.style.display = 'flex';
      if (this.openButton) this.openButton.style.display = 'block';
      return;
    }

    const drawerHtml = `
      <div id="blind-rating-drawer" 
        style="position: fixed; top: 0; right: 0; width: 650px; height: 100%; background-color: white; 
        border-left: 1px solid #e0e0e0; box-shadow: -2px 0 5px rgba(0,0,0,0.1); z-index: 9999; 
        display: flex; flex-direction: column; padding: 10px; box-sizing: border-box;"
      >
        <div style="flex-shrink: 0; height: 60px;">
          <div style="display: flex; justify-content: space-between;">
            <span style="flex: 1;" id="blind-rating-status"></span>
            <div >
              <button id="close-drawer" title="닫기">X</button>
            </div>
          </div>

          <div style="display: flex; padding: 5px 0; border-bottom: 1px solid #ccc; flex-shrink: 0; user-select: none; font-size: 0.9em;">
            <div id="sort-by-name" style="flex: 3; cursor: pointer;">회사명</div>
            <div id="sort-by-rating" style="flex: 1; text-align: center; cursor: pointer;">평점</div>
            <div style="flex: 1; text-align: center;">매출</div>
            <div style="flex: 1; text-align: center;">영업</div>
            <div id="sort-by-netincome" style="flex: 1; text-align: center; cursor: pointer;">순익</div>
          </div>
        </div>
        <div id="blind-rating-list" style="overflow-y: auto; flex-grow: 1; border-bottom: 1px solid #ccc;"></div>
        
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px; flex-shrink: 0;">
          <button id="toggle-chart-btn" title="차트 보기">📊 차트 보기</button>
        </div>

        <div id="blind-rating-chart" style="flex: 0 0 30%; padding: 10px; overflow: hidden; display: none;">
          <canvas id="company-chart"></canvas>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', drawerHtml);
    this.drawer = document.getElementById('blind-rating-drawer');
    this.list = document.getElementById('blind-rating-list');
    this.chartContainer = document.getElementById('blind-rating-chart');
    this.statusElement = document.getElementById('blind-rating-status');
    this.chartVisible = false;
    this.chartUpdateInterval = null;

    // Attach event listeners
    this.drawer.querySelector('#sort-by-name').onclick = () => this.sortItems('name');
    this.drawer.querySelector('#sort-by-rating').onclick = () => this.sortItems('rating');
    this.drawer.querySelector('#sort-by-netincome').onclick = () => this.sortItems('netIncome');
    this.drawer.querySelector('#toggle-chart-btn').onclick = () => this.toggleChart();
    this.drawer.querySelector('#close-drawer').onclick = () => {
      this.drawer.style.display = 'none';
      this.stopChartUpdates();
      this.updateButtonAndStatusDisplay();
    };

    // Apply margin-left to buttons
    this.drawer.querySelectorAll('button').forEach(btn => btn.style.marginLeft = '5px');

    this.createOpenButton();

    // Initialize chart (but don't show it)
    this.initializeChart();
  },

  createOpenButton: function () {
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

  formatStatusText: function (status) {
    if (status.type === 'progress') {
      return `수집 현황: ${status.completed} / ${status.total}`;
    } else {
      return status.text;
    }
  },

  updateButtonAndStatusDisplay: function () {
    if (!this.drawer || !this.openButton) return;

    if (this.isFullHidden) {
      this.drawer.style.display = 'none';
      this.openButton.style.display = 'none';
      return;
    }

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

  updateStatus: function (status) {
    this.latestStatus = status;
    this.updateButtonAndStatusDisplay();
  },

  formatMoney: function (amount) {
    if (!amount) return '-';
    const absAmount = Math.abs(amount);

    // 1조 이상
    if (absAmount >= 1000000000000) {
      let val = (amount / 1000000000000).toFixed(1);
      if (val.endsWith('.0')) val = val.slice(0, -2);
      return val + '조';
    }
    // 1000만 이상 (0.1억) -> 억 단위로 표시
    if (absAmount >= 10000000) {
      let val = (amount / 100000000).toFixed(1);
      if (val.endsWith('.0')) val = val.slice(0, -2);
      return val + '억';
    }
    return amount.toLocaleString();
  },

  addItem: function (companyName, companyId) {
    const itemHtml = `
      <div class="drawer-item-row" style="display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; font-size: 0.9em;">
        <div class="drawer-item-name" style="flex: 3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; text-decoration: underline;" title="원티드 상세 페이지 이동">${companyName}</div>
        <div style="display: flex; flex: 1; align-items: center;">
          <div class="drawer-item-review" style="text-align: center; cursor: pointer;">
          <img src="https://static.teamblind.com/img/www/favicon.ico" width="14" height="14" style="vertical-align: middle; margin-right: 4px;" title="블라인드 리뷰 보기">
          </div>
          <div class="drawer-item-rating" style="text-align: center;">대기 중...</div>
        </div>
        <div class="drawer-item-sales" style="flex: 1; text-align: center;">-</div>
        <div class="drawer-item-op" style="flex: 1; text-align: center;">-</div>
        <div class="drawer-item-net" style="flex: 1; text-align: center;">-</div>
      </div>
    `;
    this.list.insertAdjacentHTML('beforeend', itemHtml);
    const newRow = this.list.lastElementChild; // Get the newly added row

    // Add click listener to review cell (icon)
    const reviewCell = newRow.querySelector('.drawer-item-review');
    reviewCell.onclick = () => window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');

    // Add click listener to name cell
    const nameCell = newRow.querySelector('.drawer-item-name');
    if (companyId) {
      nameCell.onclick = () => window.open(`https://www.wanted.co.kr/company/${companyId}`, '_blank');
    } else {
      nameCell.style.cursor = 'default';
      nameCell.style.textDecoration = 'none';
      nameCell.title = '';
    }

    this.items.push({ name: companyName, rating: null, financial: null, element: newRow });
  },

  updateItem: function (companyName, rating, financial) {
    const item = this.items.find(it => it.name === companyName);
    if (!item) return;

    if (rating !== undefined) item.rating = rating;
    if (financial !== undefined) item.financial = financial;

    const ratingCell = item.element.querySelector('.drawer-item-rating');
    const salesCell = item.element.querySelector('.drawer-item-sales');
    const opCell = item.element.querySelector('.drawer-item-op');
    const netCell = item.element.querySelector('.drawer-item-net');

    // updateItem에서는 평점 셀만 업데이트
    if (rating !== undefined) {
      if (rating !== '-') {
        const color = getRatingColor(rating);
        ratingCell.innerHTML = `<b style="color: ${color}; font-size:14px;">${rating}</b>`;
      } else {
        ratingCell.innerHTML = '-';
      }
    }

    if (financial) {
      const { salesAmount, operatingIncome, netIncome } = financial;
      salesCell.textContent = this.formatMoney(salesAmount);
      opCell.textContent = this.formatMoney(operatingIncome);
      netCell.textContent = this.formatMoney(netIncome);

      // Reset colors first
      salesCell.style.color = '';
      opCell.style.color = '';
      netCell.style.color = '';

      const cells = [salesCell, opCell, netCell];

      if (netIncome > 0) {
        // Positive Net Income -> Red Background (Light Red for readability)
        cells.forEach(cell => cell.style.backgroundColor = 'rgb(158 237 184)');
      } else if (netIncome < 0) {
        // Negative Net Income -> Gray Background
        cells.forEach(cell => cell.style.backgroundColor = '#F5F5F5');
      } else {
        // Zero or undefined -> No background
        cells.forEach(cell => cell.style.backgroundColor = 'transparent');
      }
    }
  },

  updateSortIndicator: function () {
    if (!this.drawer) return; // 오류 방지 가드 추가
    const nameHeader = this.drawer.querySelector('#sort-by-name');
    const ratingHeader = this.drawer.querySelector('#sort-by-rating');
    const netIncomeHeader = this.drawer.querySelector('#sort-by-netincome');

    // Reset all headers
    nameHeader.textContent = '회사명';
    ratingHeader.textContent = '평점';
    netIncomeHeader.textContent = '순익';

    if (!this.sortState.key) return;

    // Determine which header to update
    let targetHeader;
    if (this.sortState.key === 'name') {
      targetHeader = nameHeader;
    } else if (this.sortState.key === 'rating') {
      targetHeader = ratingHeader;
    } else if (this.sortState.key === 'netIncome') {
      targetHeader = netIncomeHeader;
    }

    if (targetHeader) {
      const arrow = this.sortState.direction === 'asc' ? ' ▲' : ' ▼';
      targetHeader.textContent += arrow;
    }
  },

  initializeChart: async function () {
    try {
      await ChartManager.loadChartJs();
    } catch (error) {
      console.error('[DrawerManager] Failed to load Chart.js:', error);
    }
  },

  toggleChart: function () {
    this.chartVisible = !this.chartVisible;
    const toggleBtn = this.drawer.querySelector('#toggle-chart-btn');

    if (this.chartVisible) {
      // Show chart
      this.chartContainer.style.display = 'block';
      this.list.style.flex = '1 1 auto';
      toggleBtn.textContent = '📊 차트 숨기기';
      toggleBtn.title = '차트 숨기기';

      // Update chart immediately and start interval
      this.updateChart();
      this.startChartUpdates();
    } else {
      // Hide chart
      this.chartContainer.style.display = 'none';
      this.list.style.flex = '1 1 auto';
      toggleBtn.textContent = '📊 차트 보기';
      toggleBtn.title = '차트 보기';

      // Stop interval updates
      this.stopChartUpdates();
    }
  },

  startChartUpdates: function () {
    // Clear any existing interval
    this.stopChartUpdates();

    // Update chart every 1 second
    this.chartUpdateInterval = setInterval(() => {
      if (this.chartVisible) {
        this.updateChart();
      }
    }, 1000);
  },

  stopChartUpdates: function () {
    if (this.chartUpdateInterval) {
      clearInterval(this.chartUpdateInterval);
      this.chartUpdateInterval = null;
    }
  },

  updateChart: function () {
    if (this.items.length > 0 && window.Chart) {
      ChartManager.createScatterPlot(this.items, 'company-chart');
    }
  },

  sortItems: function (key) {
    if (this.sortState.key === key) {
      this.sortState.direction = this.sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortState.key = key;
      this.sortState.direction = key === 'rating' ? 'desc' : 'asc';
    }
    this.items.sort((a, b) => {
      const dir = this.sortState.direction === 'asc' ? 1 : -1;
      if (this.sortState.key === 'rating') {
        const ratingA = (a.rating && a.rating !== '-') ? parseFloat(a.rating) : -1;
        const ratingB = (b.rating && b.rating !== '-') ? parseFloat(b.rating) : -1;
        return (ratingA - ratingB) * dir;
      } else if (this.sortState.key === 'netIncome') {
        const netIncomeA = (a.financial && a.financial.netIncome) ? a.financial.netIncome : -Infinity;
        const netIncomeB = (b.financial && b.financial.netIncome) ? b.financial.netIncome : -Infinity;
        return (netIncomeA - netIncomeB) * dir;
      } else {
        return a.name.localeCompare(b.name) * dir;
      }
    });
    this.list.innerHTML = '';
    this.items.forEach(item => this.list.appendChild(item.element));
    this.updateSortIndicator();
  },

  clear: function () {
    if (this.list) this.list.innerHTML = '';
    this.items = [];
    this.sortState = { key: null, direction: 'desc' };
    this.updateSortIndicator();
  }
};