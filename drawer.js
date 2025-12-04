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
    this.stopRetryCheck();
  },
  hideFull: function () {
    this.isFullHidden = true;
    if (this.drawer) this.drawer.style.display = 'none';
    if (this.openButton) this.openButton.style.display = 'none';
    this.stopRetryCheck();
  },
  show: function () {
    this.isFullHidden = false;
    if (this.drawer) this.drawer.style.display = 'flex';
    if (this.openButton) this.openButton.style.display = 'none';
    this.startRetryCheck();

    chrome.runtime.sendMessage({
      type: 'GA_EVENT',
      eventName: 'open_drawer',
      params: { source: 'reopen' }
    });
  },
  create: function () {
    if (this.drawer) {
      this.drawer.style.display = 'flex';
      if (this.openButton) this.openButton.style.display = 'block';
      return;
    }

    const drawerHtml = `
      <div id="blind-rating-drawer" 
        style="position: fixed; top: 0; right: 0; width: 480px; height: 100%; background-color: white; 
        border-left: 1px solid #e0e0e0; box-shadow: -2px 0 5px rgba(0,0,0,0.1); z-index: 9999; 
        display: flex; flex-direction: column; padding: 10px; box-sizing: border-box;"
      >
        <div style="flex-shrink: 0;">
          <div style="display: flex; justify-content: space-between;">
            <span style="flex: 1;" id="blind-rating-status"></span>
            <div>
              <button id="close-drawer" title="닫기">닫기</button>
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
          <button id="toggle-chart-btn" title="차트 보기">차트 보기</button>
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

    // 이벤트 리스너 첨부
    this.drawer.querySelector('#sort-by-name').onclick = () => this.sortItems('name');
    this.drawer.querySelector('#sort-by-rating').onclick = () => this.sortItems('rating');
    this.drawer.querySelector('#sort-by-netincome').onclick = () => this.sortItems('netIncome');
    this.drawer.querySelector('#toggle-chart-btn').onclick = () => this.toggleChart();
    this.drawer.querySelector('#close-drawer').onclick = () => {
      this.drawer.style.display = 'none';
      this.stopChartUpdates();
      this.stopRetryCheck();
      this.updateButtonAndStatusDisplay();
    };

    // 버튼에 왼쪽 여백 적용
    this.drawer.querySelectorAll('button').forEach(btn => btn.style.marginLeft = '5px');

    this.createOpenButton();

    // 차트 초기화 (표시는 하지 않음)
    this.initializeChart();

    chrome.runtime.sendMessage({
      type: 'GA_EVENT',
      eventName: 'open_drawer',
      params: { source: 'create' }
    });

    this.startRetryCheck();
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

  addItem: function (companyName, companyId, jobInfo) {
    // 회사가 이미 존재하는지 확인
    const existingItem = this.items.find(it => it.name === companyName);

    if (existingItem) {
      // 새로운 공고인 경우 추가
      if (jobInfo && !existingItem.jobs.some(j => j.link === jobInfo.link)) {
        existingItem.jobs.push(jobInfo);
        this.renderJob(existingItem.element.querySelector('.drawer-item-jobs'), jobInfo);
      }
      return;
    }

    const itemHtml = `
      <div class="drawer-item-row" drawer-companyname="${companyName}" style="display: flex; flex-direction: column; border-bottom: 1px solid #eee;">
        <div style="display: flex; align-items: center;">
          
          <div class="drawer-item-toggle" style="text-align: center; cursor: pointer; font-size: 0.7em;">▷</div>
          <div class="drawer-item-companyname" 
            style="flex: 3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 8px; cursor: pointer; font-size: 0.9em;" title="화면에서 찾기">
            ${companyName}
          </div>

          <div style="display: flex; flex: 1; align-items: center; font-size: 0.9em;">
            <div class="drawer-item-review" style="text-align: center; cursor: pointer;">
              <img src="https://static.teamblind.com/img/www/favicon.ico" width="14" height="14" style="vertical-align: middle; margin-right: 4px;" title="블라인드 리뷰 보기">
              <span class="drawer-item-rating" style="text-align: center;">...</span>
            </div>
          </div>

          <div class="drawer-item-financial" 
            style="display: flex; flex: 3; align-items: center; cursor: pointer; padding: 8px; font-size: 0.9em;" title="원티드 상세 페이지 이동">
            <div class="drawer-item-sales" style="flex: 1; text-align: center;">-</div>
            <div class="drawer-item-op" style="flex: 1; text-align: center;">-</div>
            <div class="drawer-item-net" style="flex: 1; text-align: center;">-</div>
          </div>

        </div>

        <div class="drawer-item-jobs" style="padding: 8px 0px 8px 8px; font-size: 0.9em; display: none;"></div>
      </div>
  `;
    this.list.insertAdjacentHTML('beforeend', itemHtml);
    const newRow = this.list.lastElementChild; // 새로 추가된 행 컨테이너 가져오기

    // 토글 리스너 추가
    const toggleBtn = newRow.querySelector('.drawer-item-toggle');
    const jobsDiv = newRow.querySelector('.drawer-item-jobs');
    toggleBtn.onclick = () => {
      const isHidden = jobsDiv.style.display === 'none';
      jobsDiv.style.display = isHidden ? 'block' : 'none';
      toggleBtn.textContent = isHidden ? '▼' : '▷';
    };

    // 리뷰 셀(아이콘)에 클릭 리스너 추가
    const reviewCell = newRow.querySelector('.drawer-item-review');
    reviewCell.onclick = () => window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');

    // 회사명에 클릭 리스너 추가 (카드로 스크롤)
    const companyNameCell = newRow.querySelector('.drawer-item-companyname');
    let focusIndex = 0; // 다음에 포커스할 카드 추적

    companyNameCell.onclick = () => {
      const buttons = document.querySelectorAll(`[data-cy="job-card"] button[data-company-name="${companyName}"]`);
      if (buttons.length > 0) {
        // 인덱스가 범위를 벗어나면 처음으로 돌아감 (예: 목록 변경)
        if (focusIndex >= buttons.length) focusIndex = 0;

        const card = buttons[focusIndex].closest('[data-cy="job-card"]');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });

          // 기존 타임아웃 지우고 이미 애니메이션 중이면 초기화
          if (card._highlightTimer) {
            clearTimeout(card._highlightTimer);
            card.style.transition = 'none';
            card.style.boxShadow = card._originalStyles.boxShadow;
            card.style.transform = card._originalStyles.transform;
            void card.offsetWidth; // 리플로우 강제
          } else {
            // 원래 스타일 캡처
            card._originalStyles = {
              boxShadow: card.style.boxShadow,
              transform: card.style.transform,
              transition: card.style.transition
            };
          }

          // 강조 효과 적용
          card.style.transition = 'all 0.5s ease';
          card.style.boxShadow = 'inset 0 0 0 4px rgba(0, 119, 204, 0.5)';
          card.style.borderRadius = '12px';
          card.style.transform = 'scale(1.02)';

          card._highlightTimer = setTimeout(() => {
            if (card._originalStyles) {
              card.style.boxShadow = card._originalStyles.boxShadow;
              card.style.transform = card._originalStyles.transform;

              // 전환 속성을 지우기 전에 전환이 완료될 때까지 대기
              setTimeout(() => {
                // 새 애니메이션이 시작되지 않은 경우에만 지우기
                if (!card._highlightTimer) {
                  card.style.transition = card._originalStyles.transition;
                  delete card._originalStyles;
                }
              }, 500);
            }
            delete card._highlightTimer;
          }, 1500);
        }

        // 다음 클릭을 위해 증가
        focusIndex = (focusIndex + 1) % buttons.length;
      } else {
        alert('현재 화면에서 해당 회사의 공고를 찾을 수 없습니다.');
      }
    };

    // 재무 셀에 클릭 리스너 추가 (원티드 상세 페이지 열기)
    const financialCell = newRow.querySelector('.drawer-item-financial');
    if (companyId) {
      financialCell.onclick = () => window.open(`https://www.wanted.co.kr/company/${companyId}`, '_blank');
    } else {
      financialCell.style.cursor = 'default';
      financialCell.title = '';
    }

    this.items.push({ name: companyName, rating: null, financial: null, jobs: [], element: newRow });

    // 초기 공고 추가
    if (jobInfo) {
      const item = this.items[this.items.length - 1];
      item.jobs.push(jobInfo);
      this.renderJob(newRow.querySelector('.drawer-item-jobs'), jobInfo);
    }
  },

  renderJob: function (container, job) {
    const jobHtml = `
      <div title="채용 공고 페이지 이동">
        <a href="${job.link}" target="_blank" 
        style="text-decoration: none; color: #787878; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          • ${job.title} (${job.location})
        </a>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', jobHtml);
  },

  updateItem: function (companyName, rating, financial) {
    const item = this.items.find(it => it.name === companyName);
    if (!item) return;

    if (rating !== undefined) item.rating = rating;
    if (financial !== undefined) item.financial = financial;

    const ratingCell = item.element.querySelector('.drawer-item-rating');
    const finaceCell = item.element.querySelector('.drawer-item-financial');
    const salesCell = item.element.querySelector('.drawer-item-sales');
    const opCell = item.element.querySelector('.drawer-item-op');
    const netCell = item.element.querySelector('.drawer-item-net');

    // updateItem에서는 평점 셀만 업데이트
    if (rating !== undefined) {
      if (rating >= 0) {
        const parsedrating = parseFloat(rating);
        const fontWeight = parsedrating >= 4 ? '700' : '400';
        ratingCell.innerHTML = `<span style="font-size:14px; font-weight: ${fontWeight}" data-rating="${rating}">${parsedrating}</span>`;
      } else {
        ratingCell.innerHTML = `<span style="font-size:14px;" data-rating="${rating}">-</span>`;
      }
    }

    if (financial) {
      const { salesAmount, operatingIncome, netIncome } = financial;
      salesCell.textContent = this.formatMoney(salesAmount);
      opCell.textContent = this.formatMoney(operatingIncome);
      netCell.textContent = this.formatMoney(netIncome);

      let bgColor = '#f5f5f5'; // 기본 회색
      if (netIncome > 0) {
        bgColor = 'rgb(158 237 184)'; // 초록색
      } else if (operatingIncome < 0 && netIncome < 0) {
        bgColor = '#ffccc7'; // 빨간색 (배경은 연한 빨간색)
      }
      finaceCell.style.backgroundColor = bgColor;

    }
  },

  updateSortIndicator: function () {
    if (!this.drawer) return; // 오류 방지 가드 추가
    const nameHeader = this.drawer.querySelector('#sort-by-name');
    const ratingHeader = this.drawer.querySelector('#sort-by-rating');
    const netIncomeHeader = this.drawer.querySelector('#sort-by-netincome');

    // 모든 헤더 초기화
    nameHeader.textContent = '회사명';
    ratingHeader.textContent = '평점';
    netIncomeHeader.textContent = '순익';

    if (!this.sortState.key) return;

    // 업데이트할 헤더 결정
    let targetHeader;
    if (this.sortState.key === 'name') {
      targetHeader = nameHeader;
    } else if (this.sortState.key === 'rating') {
      targetHeader = ratingHeader;
    } else if (this.sortState.key === 'netIncome') {
      targetHeader = netIncomeHeader;
    }

    if (targetHeader) {
      const arrow = this.sortState.direction === 'asc' ? ' △' : ' ▽';
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

    chrome.runtime.sendMessage({
      type: 'GA_EVENT',
      eventName: 'toggle_chart',
      params: { visible: this.chartVisible }
    });

    if (this.chartVisible) {
      // 차트 표시
      this.chartContainer.style.display = 'block';
      this.list.style.flex = '1 1 auto';
      toggleBtn.textContent = '차트 숨기기';
      toggleBtn.title = '차트 숨기기';

      // 차트 즉시 업데이트 및 간격 시작
      this.updateChart();
      this.startChartUpdates();
    } else {
      // 차트 숨기기
      this.chartContainer.style.display = 'none';
      this.list.style.flex = '1 1 auto';
      toggleBtn.textContent = '차트 보기';
      toggleBtn.title = '차트 보기';

      // 간격 업데이트 중지
      this.stopChartUpdates();
    }
  },

  startChartUpdates: function () {
    // 기존 간격 지우기
    this.stopChartUpdates();

    // 1초마다 차트 업데이트
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

    chrome.runtime.sendMessage({
      type: 'GA_EVENT',
      eventName: 'sort_list',
      params: { key: this.sortState.key, direction: this.sortState.direction }
    });

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
    if (window.ChartManager) {
      ChartManager.destroy();
    }
  },

  startRetryCheck: function () {
    this.stopRetryCheck();
    this.retryCheckInterval = setInterval(() => {
      const targets = document.querySelectorAll('[data-rating="-3"]');
      if (targets.length > 0) {
        console.log(`[DrawerManager] Found ${targets.length} items with rating -3. Retrying...`);
        targets.forEach(target => {
          const row = target.closest('.drawer-item-row');
          if (row) {
            const companyName = row.getAttribute('drawer-companyname');
            if (companyName) {
              JobScanner.retryCompany(companyName);
            }
          }
        });
      }
    }, 60000);
  },

  stopRetryCheck: function () {
    if (this.retryCheckInterval) {
      clearInterval(this.retryCheckInterval);
      this.retryCheckInterval = null;
    }
  }
};