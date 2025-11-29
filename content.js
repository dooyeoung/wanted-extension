// --- 유틸리티 함수 ---
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCompanyName(text) {
  return text.replace(/\s*\(.*?\)/g, '');
}

function sortJobList(ulElement) {
  if (!ulElement) {
    console.error("UL element not found for sorting.");
    return;
  }

  const listItems = Array.from(ulElement.children); // Get all li children

  listItems.sort((a, b) => {
    const ratingA = parseFloat(a.getAttribute('blind-rating')) || 0;
    const ratingB = parseFloat(b.getAttribute('blind-rating')) || 0;
    return ratingB - ratingA; // Descending order (highest rating first)
  });

  // Clear existing list items and append sorted ones
  listItems.forEach(item => ulElement.appendChild(item));
}

function addBlindReviewSortButton() {
  const sortFilterUl = document.querySelector('ul.SortFilter_SortFilter__list__QuSd6');
  if (!sortFilterUl) {
    console.log("Sort filter UL not found.");
    return;
  }

  const newSortItemHtml = `
    <li class="SortFilter_SortFilter__list__item__CJk9X" style="width: 100px">
      <button type="button" id="sort-by-blind-review">
        <span class="SortFilter_SortFilter__list__item__text__lJESk wds-83zqyc">블라인드 리뷰순</span>
      </button>
    </li>
  `;
  sortFilterUl.insertAdjacentHTML('beforeend', newSortItemHtml);

  const blindReviewSortButton = document.getElementById('sort-by-blind-review');
  if (blindReviewSortButton) {
    blindReviewSortButton.onclick = (event) => {
      // Remove selected class from all siblings (including native ones)
      sortFilterUl.querySelectorAll('li').forEach(li => {
        li.classList.remove('SortFilter_SortFilter__list__item__selected__k5thb');
        li.querySelector('span')?.classList.remove('SortFilter_SortFilter__list__item__selected__text__u7klW', 'wds-12dtfjt');
        li.querySelector('span')?.classList.add('wds-83zqyc');
      });

      // Add selected class to the clicked item (our custom button)
      const parentLi = event.currentTarget.closest('li');
      parentLi.classList.add('SortFilter_SortFilter__list__item__selected__k5thb');
      parentLi.querySelector('span')?.classList.add('SortFilter_SortFilter__list__item__selected__text__u7klW', 'wds-12dtfjt');
      parentLi.querySelector('span')?.classList.remove('wds-83zqyc');

      const jobListUl = document.querySelector('ul[data-cy="job-list"]');
      sortJobList(jobListUl);
    };
  }
}
function injectFinancialInfoOnDetailPage(report, rating, companyName) {
  const targetButton = document.querySelector('aside button.wds-slid3e');
  if (!targetButton) {
    console.log("[WantedRating] Target button for injection not found.");
    return;
  }

  const parent = targetButton.parentNode;

  // 1. Inject Blind Rating (if not exists)
  if (!parent.querySelector('.wanted-rating-blind-info')) {
    const blindDiv = document.createElement('div');
    blindDiv.className = 'wanted-rating-blind-info';
    blindDiv.style.marginTop = '15px';
    blindDiv.style.padding = '15px';
    blindDiv.style.backgroundColor = '#fff'; // White background for contrast or keep consistent? Let's use a distinct look.
    blindDiv.style.border = '1px solid #e1e2e3';
    blindDiv.style.borderRadius = '8px';
    blindDiv.style.display = 'flex';
    blindDiv.style.alignItems = 'center';
    blindDiv.style.justifyContent = 'space-between';
    blindDiv.style.cursor = 'pointer';
    blindDiv.title = '블라인드 리뷰 보러가기';

    blindDiv.onclick = () => {
      window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');
    };

    blindDiv.innerHTML = `
      <div style="display: flex; align-items: center;">
        <img src="https://static.teamblind.com/img/www/favicon.ico" width="20" height="20" style="margin-right: 8px;">
        <span style="font-weight: bold; color: #333; font-size: 14px;">블라인드 평점</span>
      </div>
      <div style="display: flex; align-items: center;">
        <span style="font-size: 16px; font-weight: bold; color: #333; margin-right: 5px;">${rating}</span>
      </div>
    `;

    // Insert after the button
    parent.insertBefore(blindDiv, targetButton.nextSibling);
  }

  // 2. Inject Financial Info (if not exists)
  if (!parent.querySelector('.wanted-rating-financial-info')) {
    const { year, salesAmount, operatingIncome, netIncome } = report;

    const formatMoney = (amount) => {
      if (!amount) return '-';
      const absAmount = Math.abs(amount);
      if (absAmount >= 1000000000000) return (amount / 1000000000000).toFixed(1) + '조';
      if (absAmount >= 100000000) return (amount / 100000000).toFixed(1) + '억';
      return amount.toLocaleString();
    };

    const finDiv = document.createElement('div');
    finDiv.className = 'wanted-rating-financial-info';
    finDiv.style.marginTop = '10px'; // Less margin between the two boxes
    finDiv.style.padding = '15px';
    finDiv.style.backgroundColor = '#f8f9fa';
    finDiv.style.borderRadius = '8px';
    finDiv.style.border = '1px solid #e1e2e3';
    finDiv.style.fontSize = '14px';
    finDiv.style.color = '#333';

    finDiv.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 8px; color: #171717;">📊 ${year}년 재무정보</div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="color: #888;">매출액</span>
        <span style="font-weight: 600;">${formatMoney(salesAmount)}</span>
      </div>
      <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
        <span style="color: #888;">영업이익</span>
        <span style="font-weight: 600; color: ${operatingIncome > 0 ? '#00a8ff' : '#ff4d4f'};">${formatMoney(operatingIncome)}</span>
      </div>
      <div style="display: flex; justify-content: space-between;">
        <span style="color: #888;">당기순이익</span>
        <span style="font-weight: 600; color: ${netIncome > 0 ? '#00a8ff' : '#ff4d4f'};">${formatMoney(netIncome)}</span>
      </div>
    `;

    // Insert after the Blind div (which is nextSibling of button now)
    // Or just append to parent? No, we want it in specific position.
    // If Blind div exists, insert after it.
    const blindDiv = parent.querySelector('.wanted-rating-blind-info');
    if (blindDiv) {
      parent.insertBefore(finDiv, blindDiv.nextSibling);
    } else {
      parent.insertBefore(finDiv, targetButton.nextSibling);
    }
  }
}


const getOneCompany = async () => {
  let retries = 0;
  const maxRetries = 10;

  while (retries < maxRetries) {
    // Try to find company ID from links (e.g. /company/12345)
    const companyLink = document.querySelector('a[href^="/company/"]');

    if (companyLink) {
      const href = companyLink.getAttribute('href');
      const match = href.match(/\/company\/(\d+)/);

      if (match && match[1]) {
        const companyId = match[1];
        // Try to get name from the link text or alt text, fallback to "Unknown"
        const companyName = companyLink.textContent.trim() || "Unknown Company";

        // Fetch Blind Review
        let blindRating = '-';
        try {
          const result = await BlindAPI.fetchReview(extractCompanyName(companyName));
          blindRating = result.rating;
          console.log(`[WantedRating] Blind Review for ${companyName}:`, result);
        } catch (e) {
          console.error("[WantedRating] Failed to fetch Blind review:", e);
        }

        chrome.runtime.sendMessage(
          { type: 'FETCH_WANTED_COMPANY_INFO', companyId: companyId },
          (response) => {
            if (response && response.success) {

              // If we got the hash, let's also try to fetch the financial report to be complete
              if (response.regNoHash) {
                chrome.runtime.sendMessage(
                  { type: 'FETCH_FINANCIAL_REPORT', regNoHash: response.regNoHash },
                  (finResponse) => {
                    if (finResponse && finResponse.success) {
                      console.log(`[WantedRating] Financial Data for ${companyName}:`, finResponse.data);

                      if (finResponse.data.financialReport && finResponse.data.financialReport.length > 0) {
                        const lastReport = finResponse.data.financialReport[finResponse.data.financialReport.length - 1];
                        injectFinancialInfoOnDetailPage(lastReport, blindRating, companyName);
                      }
                    } else {
                      console.log(`[WantedRating] No Financial Data or Error for ${companyName}:`, finResponse?.error);
                    }
                  }
                );
              }

            } else {
              console.error(`[WantedRating] Failed to fetch info for ${companyName}:`, response?.error);
            }
          }
        );
        return; // Success, exit function
      } else {
        console.log("[WantedRating] Could not extract company ID from link:", href);
      }
    }

    // Wait before retrying
    await sleep(500);
    retries++;
  }

  console.log("[WantedRating] Company link not found on page after retries.");
};

// --- API 모듈 ---
const JobScanner = {
  queue: [],
  activeRequests: 0,
  MAX_CONCURRENCY: 3,
  totalCompanies: 0,
  completedCompanies: 0,
  ratingsCache: {},
  isDrawerInitialized: false,
  processedCompanies: new Set(),
  scrollTimer: null,

  // Queue Consumer
  processQueue: function () {
    while (this.queue.length > 0 && this.activeRequests < this.MAX_CONCURRENCY) {
      this.processNextItem();
    }
  },

  processNextItem: async function () {
    const item = this.queue.shift();
    if (!item) return;

    const { name, id, skipRating } = item;

    this.activeRequests++;

    try {
      const processRating = (rating) => {
        DrawerManager.updateItem(name, rating);
        if (rating !== '-') {
          // Get financial data from cache if available
          let financial = undefined;
          if (this.ratingsCache[name] && typeof this.ratingsCache[name] === 'object') {
            financial = this.ratingsCache[name].financial;
          }

          document.querySelectorAll(`[data-cy="job-card"] button[data-company-name="${name}"]`).forEach(button => {
            const container = button.closest('[data-cy="job-card"]');
            if (container) {
              UIManager.injectRating(container, rating, name, financial);
            }
          });
        }
        this.completedCompanies++;
        DrawerManager.updateStatus({ type: 'progress', completed: this.completedCompanies, total: this.totalCompanies });
      };

      // Fetch regNoHash if we have an ID
      if (id) {
        chrome.runtime.sendMessage(
          { type: 'FETCH_WANTED_COMPANY_INFO', companyId: id },
          (response) => {
            if (response && response.success) {

              // Update cache with hash
              if (!this.ratingsCache[name]) this.ratingsCache[name] = { rating: '-' };
              // Handle legacy string cache
              if (typeof this.ratingsCache[name] !== 'object') this.ratingsCache[name] = { rating: this.ratingsCache[name] };

              this.ratingsCache[name].regNoHash = response.regNoHash;
              StorageManager.save(this.ratingsCache);

              // Fetch Financial Data
              chrome.runtime.sendMessage(
                { type: 'FETCH_FINANCIAL_REPORT', regNoHash: response.regNoHash },
                (finResponse) => {
                  if (finResponse && finResponse.success && finResponse.data && finResponse.data.financialReport) {
                    const report = finResponse.data.financialReport;
                    if (report.length > 0) {
                      const lastReport = report[report.length - 1];
                      const { year, operatingIncome, netIncome, salesAmount } = lastReport;

                      // Update cache with financial data
                      if (this.ratingsCache[name]) {
                        this.ratingsCache[name].financial = { year, operatingIncome, netIncome, salesAmount };
                        StorageManager.save(this.ratingsCache);

                        // Update Drawer
                        DrawerManager.updateItem(name, undefined, this.ratingsCache[name].financial);
                      }
                    }
                  } else {
                    console.warn(`[WantedRating] Failed to get financial data for ${name}:`, finResponse?.error);
                  }
                }
              );

            } else {
              console.warn(`[WantedRating] Failed to get hash for ${name}:`, response?.error);
            }
          }
        );
      }

      if (skipRating) {
        this.completedCompanies++;
        return;
      }

      // Check cache again (it might have been updated with hash above)
      let cachedRating = this.ratingsCache[name];
      let cachedFinancial = undefined;

      // Normalize to string if object
      if (typeof cachedRating === 'object') {
        cachedFinancial = cachedRating.financial;
        cachedRating = cachedRating.rating;
      }

      if (cachedRating && cachedRating !== '-') {
        processRating(cachedRating);
        if (cachedFinancial) DrawerManager.updateItem(name, undefined, cachedFinancial);
      } else {
        // Randomized Jitter: 200ms - 600ms
        const delay = Math.floor(Math.random() * (600 - 200 + 1) + 200);
        await sleep(delay);

        const result = await BlindAPI.fetchReview(extractCompanyName(name));
        const { rating } = result;

        // Update cache with rating, preserving hash if exists
        if (!this.ratingsCache[name]) this.ratingsCache[name] = { rating: '-' };
        if (typeof this.ratingsCache[name] !== 'object') this.ratingsCache[name] = { rating: this.ratingsCache[name] };

        this.ratingsCache[name].rating = rating;

        await StorageManager.save(this.ratingsCache);
        processRating(rating);
        // Financial might have been updated asynchronously, so we don't pass it here explicitly unless we re-read cache,
        // but processRating calls updateItem which might overwrite? No, updateItem handles partial updates.
        // Let's re-read cache just in case financial came in fast.
        if (this.ratingsCache[name].financial) {
          DrawerManager.updateItem(name, undefined, this.ratingsCache[name].financial);
        }
      }
    } catch (err) {
      console.error(`Error processing ${name}:`, err);
      // Backoff on error
      await sleep(5000);
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  },

  scanVisibleCompanies: function () {
    const buttons = document.querySelectorAll('[data-cy="job-card"] button[data-company-name]');
    let newFound = false;

    buttons.forEach(button => {
      const name = button.getAttribute('data-company-name');
      const id = button.getAttribute('data-company-id'); // Extract ID
      if (!name) return;

      // 1. Discovery: If new to this session, add to drawer and queue
      if (!this.processedCompanies.has(name)) {
        this.processedCompanies.add(name);
        this.totalCompanies++;
        newFound = true;

        DrawerManager.addItem(name, id);

        if (this.ratingsCache[name]) {
          // Even if cached, we queue it to fetch regNoHash, but skip rating fetch
          this.queue.push({ name, id, skipRating: true });
        } else {
          this.queue.push({ name, id, skipRating: false }); // Push object with ID
          // Inject LOADING state immediately
          const container = button.closest('[data-cy="job-card"]');
          if (container) {
            UIManager.injectRating(container, 'LOADING', name);
          }
        }
      }

      // 2. Injection: Always try to inject if cached (handles multiple cards/re-renders)
      if (this.ratingsCache[name]) {
        let rating = this.ratingsCache[name];
        let financial = undefined;

        // Handle object structure
        if (typeof rating === 'object') {
          financial = rating.financial;
          rating = rating.rating;
        }

        const container = button.closest('[data-cy="job-card"]');
        if (container && rating !== '-') {
          UIManager.injectRating(container, rating, name, financial);
        }
        // Also update drawer for cached items if it's not already updated by processNextItem
        // This ensures the drawer reflects the state immediately on scan if cached.
        DrawerManager.updateItem(name, rating, financial);
      }
    });

    if (newFound) {
      DrawerManager.updateStatus({ type: 'progress', completed: this.completedCompanies, total: this.totalCompanies });
      this.processQueue();
    }
  },

  handleScroll: function () {
    if (this.scrollTimer) clearTimeout(this.scrollTimer);
    this.scrollTimer = setTimeout(() => {
      this.scanVisibleCompanies();
    }, 200); // Debounce scroll events
  },

  init: async function (autoShowDrawer = true) {
    this.ratingsCache = await StorageManager.load();

    // Initialize Drawer immediately
    if (!this.isDrawerInitialized) {
      DrawerManager.create();
      if (!autoShowDrawer) {
        DrawerManager.hideFull();
      }
      DrawerManager.clear();
      // Remove old event listeners if any (not strictly necessary as we are replacing logic)
      // Setup close button
      const closeBtn = document.getElementById('close-drawer');
      if (closeBtn) {
        closeBtn.onclick = () => {
          DrawerManager.drawer.style.display = 'none';
          DrawerManager.updateButtonAndStatusDisplay();
        };
      }
      this.isDrawerInitialized = true;
    }

    // Initial scan
    this.scanVisibleCompanies();

    // Scroll listener
    window.addEventListener('scroll', () => this.handleScroll());

    // MutationObserver for dynamic content loading (infinite scroll)
    const targetNode = document.querySelector('ul[data-cy="job-list"]');
    if (targetNode) {
      const observer = new MutationObserver((mutations) => {
        // With subtree: false, we only care about direct children (li elements) being added.
        // We don't need complex filtering because our injections happen deep inside the children,
        // so they won't trigger this observer anymore.
        let shouldScan = false;
        for (const mutation of mutations) {
          if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            shouldScan = true;
            break;
          }
        }

        if (shouldScan) {
          this.scanVisibleCompanies();
        }
      });
      // CRITICAL FIX: subtree: false
      // We only want to know when new LI elements are added to the UL.
      // We do NOT want to know when we modify the content inside those LIs (injecting ratings).
      observer.observe(targetNode, { childList: true, subtree: false });
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'SHOW_DRAWER') {
        if (DrawerManager.drawer) {
          DrawerManager.drawer.style.display = 'flex';
          DrawerManager.updateButtonAndStatusDisplay();
        }
      }
    });
  }
};

// --- URL Observer & Page Transition ---
let lastUrl = location.href;

const handlePageTransition = async () => {
  const isListingPage = window.location.pathname.startsWith('/wdlist');
  const isDetailPage = window.location.pathname.startsWith('/wd/') && !isNaN(parseInt(window.location.pathname.split('/')[2]));

  console.log(`[WantedRating] Page Transition: Listing=${isListingPage}, Detail=${isDetailPage}`);

  if (isListingPage) {
    // Ensure drawer is initialized and visible
    if (!JobScanner.isDrawerInitialized) {
      await JobScanner.init(true);
    } else {
      DrawerManager.show();
    }
    // Trigger scan in case we navigated back to new content
    JobScanner.scanVisibleCompanies();
  } else if (isDetailPage) {
    // Ensure drawer is initialized (but hidden)
    if (!JobScanner.isDrawerInitialized) {
      await JobScanner.init(false);
      DrawerManager.hideFull(); // Explicitly hide everything after init
    } else {
      DrawerManager.hideFull();
    }

    // Fetch info for the new company
    await getOneCompany();
  }
};

const observeUrlChanges = () => {
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      handlePageTransition();
    }
  });
  observer.observe(document, { subtree: true, childList: true });
};

(async () => {
  // Initial check
  await handlePageTransition();

  // Start observing
  observeUrlChanges();
})();