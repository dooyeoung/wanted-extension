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
      // Remove selected class from all siblings
      sortFilterUl.querySelectorAll('li').forEach(li => {
        li.classList.remove('SortFilter_SortFilter__list__item__selected__k5thb');
        li.querySelector('span')?.classList.remove('SortFilter_SortFilter__list__item__selected__text__u7klW', 'wds-12dtfjt');
        li.querySelector('span')?.classList.add('wds-83zqyc'); // Re-add default text class
      });

      // Add selected class to the clicked item
      const parentLi = event.currentTarget.closest('li');
      parentLi.classList.add('SortFilter_SortFilter__list__item__selected__k5thb');
      parentLi.querySelector('span')?.classList.add('SortFilter_SortFilter__list__item__selected__text__u7klW', 'wds-12dtfjt');
      parentLi.querySelector('span')?.classList.remove('wds-83zqyc'); // Remove default text class

      const jobListUl = document.querySelector('ul[data-cy="job-list"]');
      sortJobList(jobListUl);
    };
  }
}

const getOneCompany = async () => {
  // Placeholder selectors - these need to be verified by inspecting a Wanted detail page
  const companyName = document.querySelector('a[data-company-name]').textContent;
  console.log(companyName);
};

// --- API 모듈 ---
const JobScanner = {
  isScanning: false, isPaused: false, totalCompanies: 0, completedCompanies: 0, ratingsCache: {},
  isDrawerInitialized: false,
  jobListObserver: null,
  reinjectTimer: null,

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
          const name = taskQueue.shift(); // Process one by one

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

          if (this.ratingsCache[name]) {
            processRating(this.ratingsCache[name]);
          } else {
            const result = await BlindAPI.fetchReview(extractCompanyName(name));
            const { rating } = result;
            this.ratingsCache[name] = rating;
            await StorageManager.save(this.ratingsCache);
            processRating(rating);
            await sleep(100); // API fetch delay
          }
        } else {
          await sleep(500);
        }
      }
      this.complete();
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
            this.totalCompanies++; // Increment total count regardless of cache hit

            DrawerManager.addItem(name); // Add to drawer UI

            if (this.ratingsCache[name]) { // Check cache
              const rating = this.ratingsCache[name];
              // Update UI immediately with cached rating
              DrawerManager.updateItem(name, rating);
              if (rating !== 'N/A') {
                document.querySelectorAll(`button[data-company-name="${name}"]`).forEach(btn => {
                  const container = btn.parentElement.parentElement;
                  UIManager.injectRating(container, rating, name);
                });
              }
              this.completedCompanies++; // Mark as completed
            } else {
              taskQueue.push(name); // Not in cache, add to fetch queue
            }
            DrawerManager.updateStatus({ type: 'progress', completed: this.completedCompanies, total: this.totalCompanies });
          }
        });
        window.scrollTo(0, document.body.scrollHeight);
        await sleep(500);

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

  complete: function() {
    DrawerManager.updateStatus({ text: '수집 완료', color: 'green' });
    this.isScanning = false;
    document.getElementById('pause-scan').style.display = 'none';
    document.getElementById('resume-scan').style.display = 'none';

    this.reinjectRatings();
    addBlindReviewSortButton();
  },

  reinjectRatings: function() {
    for (const name in this.ratingsCache) {
      const rating = this.ratingsCache[name];
      if (rating !== 'N/A') {
        document.querySelectorAll(`button[data-company-name="${name}"]`).forEach(btn => {
          const container = btn.parentElement.parentElement;
          // Check if the rating is already injected to avoid duplicates
          if (!container.querySelector('.blind-score')) {
            UIManager.injectRating(container, rating, name);
          }
        });
      }
    }
  },

  init: async function() {
    this.ratingsCache = await StorageManager.load();

    const isListingPage = window.location.pathname.startsWith('/wdlist');
    if (isListingPage) {
      // Set up MutationObserver for the job list
      const targetNode = document.querySelector('ul[data-cy="job-list"]');
      if (targetNode) {
        const config = { childList: true, subtree: false }; // Observe direct children

        const callback = (mutationsList, observer) => {
          // Debounce the re-injection logic
          clearTimeout(this.reinjectTimer);
          this.reinjectTimer = setTimeout(() => {
            console.log('Job list changed, re-injecting ratings...');
            this.reinjectRatings();
          }, 500); // Debounce by 500ms
        };

        this.jobListObserver = new MutationObserver(callback);
        this.jobListObserver.observe(targetNode, config);
      }
    }

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'SHOW_DRAWER') {
        if (!this.isDrawerInitialized) {
          DrawerManager.create();
          DrawerManager.clear();
          // 버튼 이벤트 핸들러 설정
          document.getElementById('start-scan-in-drawer').onclick = () => this.startFullScan();
          document.getElementById('pause-scan').onclick = () => this.pause();
          document.getElementById('resume-scan').onclick = () => this.resume();
          document.getElementById('close-drawer').onclick = () => {
            DrawerManager.drawer.style.display = 'none';
            DrawerManager.updateButtonAndStatusDisplay();
          };
          DrawerManager.updateStatus({ text: '대기 중', color: 'gray'});
          // 초기 버튼 상태 설정
          document.getElementById('start-scan-in-drawer').style.display = 'inline-block';
          document.getElementById('pause-scan').style.display = 'none';
          document.getElementById('resume-scan').style.display = 'none';
          this.isDrawerInitialized = true;
        } else {
          // If already initialized, just ensure it's visible
          if (DrawerManager.drawer) {
            DrawerManager.drawer.style.display = 'flex';
          }
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