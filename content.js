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
  if (numericRating >= 2.0) return 'yellow';
  return 'gray';
}

const getOneCompany = async () => {
  // Placeholder selectors - these need to be verified by inspecting a Wanted detail page
  const companyName = document.querySelector('a[data-company-name]').textContent;
  console.log(companyName);
};

// --- API 모듈 ---
const JobScanner = {
  isScanning: false, isPaused: false, totalCompanies: 0, completedCompanies: 0, ratingsCache: {},

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

  complete: function() {
    DrawerManager.updateStatus({ text: '수집 완료', color: 'green' });
    this.isScanning = false;
    document.getElementById('pause-scan').style.display = 'none';
    document.getElementById('resume-scan').style.display = 'none';

    // Iterate through ratingsCache and inject ratings into company cards
    for (const name in this.ratingsCache) {
      const rating = this.ratingsCache[name];
      if (rating !== 'N/A') { // Only inject if it's a valid rating
        document.querySelectorAll(`button[data-company-name="${name}"]`).forEach(btn => {
          const container = btn.parentElement.parentElement;
          UIManager.injectRating(container, rating, name);
        });
      }
    }
  },

  init: async function() {
    this.ratingsCache = await StorageManager.load();
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

(async () => {
  const isListingPage = window.location.pathname.startsWith('/wdlist');
  const isDetailPage = window.location.pathname.startsWith('/wd/') && !isNaN(parseInt(window.location.pathname.split('/')[2]));

  if (isListingPage) {
    JobScanner.init()
  } else if (isDetailPage) {
    await getOneCompany(); // Call the standalone function
  } else {
    console.log("Not a Wanted listing or detail page, doing nothing.");
  }
})();