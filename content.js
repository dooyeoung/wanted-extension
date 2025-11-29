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

const getOneCompany = async () => {
  // Placeholder selectors - these need to be verified by inspecting a Wanted detail page
  const companyName = document.querySelector('a[data-company-name]').textContent;
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
        if (rating !== 'N/A') {
          document.querySelectorAll(`button[data-company-name="${name}"]`).forEach(button => {
            const container = button.parentElement.parentElement;
            UIManager.injectRating(container, rating, name);
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
              console.log(`[WantedRating] Company: ${name}, Hash: ${response.regNoHash}`);

              // Update cache with hash
              if (!this.ratingsCache[name]) this.ratingsCache[name] = { rating: 'N/A' };
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

                      console.log(`[WantedRating] Financial for ${name}:`, { year, operatingIncome, netIncome, salesAmount });

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

      if (cachedRating && cachedRating !== 'N/A') {
        processRating(cachedRating);
        if (cachedFinancial) DrawerManager.updateItem(name, undefined, cachedFinancial);
      } else {
        // Randomized Jitter: 200ms - 600ms
        const delay = Math.floor(Math.random() * (600 - 200 + 1) + 200);
        await sleep(delay);

        const result = await BlindAPI.fetchReview(extractCompanyName(name));
        const { rating } = result;

        // Update cache with rating, preserving hash if exists
        if (!this.ratingsCache[name]) this.ratingsCache[name] = { rating: 'N/A' };
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
    const buttons = document.querySelectorAll('button[data-company-name]');
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
          const container = button.parentElement.parentElement;
          UIManager.injectRating(container, 'LOADING', name);
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

        const container = button.parentElement.parentElement;
        if (rating !== 'N/A') {
          UIManager.injectRating(container, rating, name);
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

  init: async function () {
    this.ratingsCache = await StorageManager.load();

    // Initialize Drawer immediately
    if (!this.isDrawerInitialized) {
      DrawerManager.create();
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
          console.log('[WantedRating] New job cards detected, scanning...');
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

(async () => {
  const isListingPage = window.location.pathname.startsWith('/wdlist');
  const isDetailPage = window.location.pathname.startsWith('/wd/') && !isNaN(parseInt(window.location.pathname.split('/')[2]));

  if (isListingPage) {
    JobScanner.init();

  } else if (isDetailPage) {
    await getOneCompany(); // Call the standalone function
  } else {
    console.log("Not a Wanted listing or detail page, doing nothing.");
  }
})();