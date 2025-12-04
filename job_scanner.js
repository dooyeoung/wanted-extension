
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
    baseDelay: 1500, // 기본 지연 시간 증가
    consecutiveErrors: 0,
    requestCount: 0, // 배치 일시 중지를 위한 요청 수 추적

    // 스캐너 상태 초기화
    reset: function () {
        this.queue = [];
        this.activeRequests = 0;
        this.totalCompanies = 0;
        this.completedCompanies = 0;
        this.processedCompanies.clear();
        // 캐시는 중요하므로 지우지 않음
    },

    // 큐 소비자
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

                // 캐시에서 재무 데이터 가져오기 (평점과 무관)
                let financial = undefined;
                if (this.ratingsCache[name] && typeof this.ratingsCache[name] === 'object') {
                    financial = this.ratingsCache[name].financial;
                }

                if (rating >= 0) {
                    document.querySelectorAll(`[data-cy="job-card"] button[data-company-name="${name}"]`).forEach(button => {
                        const container = button.closest('[data-cy="job-card"]');
                        if (container) {
                            UIManager.injectRating(container, rating, name, financial);
                        }
                    });
                } else {
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

            // ID가 있는 경우 regNoHash 가져오기
            if (id) {
                chrome.runtime.sendMessage(
                    { type: 'FETCH_WANTED_COMPANY_INFO', companyId: id },
                    (response) => {
                        if (response && response.success) {

                            // 해시로 캐시 업데이트
                            if (!this.ratingsCache[name]) this.ratingsCache[name] = { rating: 0 };
                            // 레거시 문자열 캐시 처리
                            if (typeof this.ratingsCache[name] !== 'object') this.ratingsCache[name] = { rating: this.ratingsCache[name] };

                            this.ratingsCache[name].regNoHash = response.regNoHash;
                            StorageManager.save(this.ratingsCache);

                            // 재무 데이터 가져오기
                            chrome.runtime.sendMessage(
                                { type: 'FETCH_FINANCIAL_REPORT', regNoHash: response.regNoHash },
                                (finResponse) => {
                                    if (finResponse && finResponse.success && finResponse.data && finResponse.data.financialReport) {
                                        const report = finResponse.data.financialReport;
                                        if (report.length > 0) {
                                            const lastReport = report[report.length - 1];
                                            const { year, operatingIncome, netIncome, salesAmount } = lastReport;

                                            // 재무 데이터로 캐시 업데이트
                                            if (this.ratingsCache[name]) {
                                                this.ratingsCache[name].financial = { year, operatingIncome, netIncome, salesAmount };
                                                StorageManager.save(this.ratingsCache);

                                                // 드로어 업데이트
                                                DrawerManager.updateItem(name, undefined, this.ratingsCache[name].financial);
                                            }
                                        }
                                    } else {
                                        // console.warn(`[WantedRating] Failed to get financial data for ${name}:`, finResponse?.error);
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

            // 캐시 다시 확인 (위에서 해시로 업데이트되었을 수 있음)
            let cachedRating = this.ratingsCache[name];
            let cachedFinancial = undefined;

            // 객체인 경우 문자열로 정규화
            if (typeof cachedRating === 'object') {
                // 만료 확인
                if (cachedRating.expired_at && Date.now() > cachedRating.expired_at) {
                    cachedRating = null; // 강제 재요청
                } else {
                    cachedFinancial = cachedRating.financial;
                    cachedRating = cachedRating.rating;
                }
            }

            if (cachedRating && cachedRating >= 0) {
                processRating(cachedRating);
                if (cachedFinancial) DrawerManager.updateItem(name, undefined, cachedFinancial);
            } else {
                // 무작위 지터: 200ms - 600ms
                const delay = Math.floor(Math.random() * (600 - 200 + 1) + 200);
                await sleep(delay);

                // 배치 속도 제한: 30 요청마다 3초 일시 중지
                if (this.requestCount > 0 && this.requestCount % 30 === 0) {
                    await sleep(3000);
                }

                const result = await BlindAPI.fetchReview(extractCompanyName(name));
                this.requestCount++; // 요청 수 증가
                const { rating } = result;

                // 평점으로 캐시 업데이트, 존재하는 경우 해시 보존
                if (!this.ratingsCache[name]) this.ratingsCache[name] = { rating: 0 };
                if (typeof this.ratingsCache[name] !== 'object') this.ratingsCache[name] = { rating: this.ratingsCache[name] };

                this.ratingsCache[name].rating = rating;
                // 만료 설정 (7일)
                this.ratingsCache[name].expired_at = Date.now() + (7 * 24 * 60 * 60 * 1000);

                await StorageManager.save(this.ratingsCache);
                processRating(rating);
                // 재무 정보가 비동기적으로 업데이트되었을 수 있으므로 캐시를 다시 읽지 않는 한 여기서 명시적으로 전달하지 않음,
                // 하지만 processRating은 updateItem을 호출하는데 덮어쓸 수 있나? 아니요, updateItem은 부분 업데이트를 처리함.
                // 재무 정보가 빨리 들어왔을 경우를 대비해 캐시를 다시 읽음.
                if (this.ratingsCache[name].financial) {
                    DrawerManager.updateItem(name, undefined, this.ratingsCache[name].financial);
                }
            }
        } catch (err) {
            console.error(`Error processing ${name}:`, err);

            // 카운터 동기화를 유지하기 위해 완료(실패)로 표시
            this.completedCompanies++;
            DrawerManager.updateStatus({ type: 'progress', completed: this.completedCompanies, total: this.totalCompanies });

            // 선택적으로 드로어에 표시
            DrawerManager.updateItem(name, '-'); // 또는 'Error'

            // 오류 시 백오프
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

            // 1. 발견: 이 세션에 새로운 경우 드로어 및 큐에 추가
            if (!this.processedCompanies.has(name)) {
                this.processedCompanies.add(name);
                this.totalCompanies++;
                newFound = true;

                // 채용 공고 제목 및 링크 추출
                const linkElement = button.closest('a');
                const jobTitle = button.getAttribute('data-position-name');
                const jobLink = linkElement ? linkElement.href : '#';
                const jobLocation = linkElement.querySelector('span[class*="location"]')?.textContent.trim().split('·')
                    .map(v => v.trim())
                    .pop();

                DrawerManager.addItem(name, id, { title: jobTitle, link: jobLink, location: jobLocation });

                if (this.ratingsCache[name] && this.ratingsCache[name].rating >= 0) {
                    // 만료 확인
                    const cached = this.ratingsCache[name];
                    let isExpired = false;
                    if (typeof cached === 'object' && cached.expired_at && Date.now() > cached.expired_at) {
                        isExpired = true;
                    }

                    if (!isExpired) {
                        // 유효한 캐시: 평점 가져오기 건너뛰기
                        this.queue.push({ name, id, skipRating: true });
                    } else {
                        // 만료됨: 모두 가져오기
                        this.queue.push({ name, id, skipRating: false });
                        // 로딩 상태 주입
                        const container = button.closest('[data-cy="job-card"]');
                        if (container) {
                            const financial = cached.financial; // 가능한 경우 재무 정보 전달
                            UIManager.injectRating(container, 'LOADING', name, financial);
                        }
                    }
                } else {
                    this.queue.push({ name, id, skipRating: false }); // ID가 있는 객체 푸시
                    // 즉시 로딩 상태 주입
                    const container = button.closest('[data-cy="job-card"]');
                    if (container) {
                        UIManager.injectRating(container, 'LOADING', name);
                    }
                }
            }
            else {
                const linkElement = button.closest('a');
                const jobTitle = button.getAttribute('data-position-name');
                const jobLink = linkElement ? linkElement.href : '#';
                const jobLocation = linkElement.querySelector('span[class*="location"]')?.textContent.trim().split('·')
                    .map(v => v.trim())
                    .pop();

                DrawerManager.addItem(name, id, { title: jobTitle, link: jobLink, location: jobLocation });
            }

            // 2. 주입: 캐시된 경우 항상 주입 시도 (여러 카드/재렌더링 처리)
            if (this.ratingsCache[name]) {
                let rating = this.ratingsCache[name];
                let financial = undefined;

                // 객체 구조 처리
                if (typeof rating === 'object') {
                    // 만료 확인
                    if (rating.expired_at && Date.now() > rating.expired_at) {
                        // 만료됨: 주입하지 않고 큐가 재요청을 처리하도록 함 (새로운 경우 1단계에서 큐에 추가했으므로,
                        // 하지만 이 세션에서 이미 처리된 경우 다시 큐에 넣어야 할까?
                        // 사실, scanVisibleCompanies는 !processedCompanies.has(name)인 경우 큐에 추가함.
                        // 캐시에 있지만 만료된 경우 "처리되지 않음"으로 취급하거나 강제로 큐에 추가해야 할까?
                        // 잠시만, 캐시에 있으면 보통 큐에서 평점 가져오기를 건너뜀.
                        // 위의 큐 로직도 수정해야 함.
                    } else {
                        financial = rating.financial;
                        rating = rating.rating;
                    }
                }

                const container = button.closest('[data-cy="job-card"]');
                // 유효한 평점이고 만료되지 않은 경우에만 주입 (만료된 경우 평점은 객체이거나 이미 처리됨)
                // 만료된 경우 rating 변수는 여전히 객체임.

                if (typeof rating !== 'object') {
                    UIManager.injectRating(container, rating, name, financial);
                    DrawerManager.updateItem(name, rating, financial);
                }
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
        }, 200); // 스크롤 이벤트 디바운스
    },

    retryCompany: function (companyName) {
        // 이미 큐에 있는지 확인
        if (this.queue.some(item => item.name === companyName)) {
            console.log(`[JobScanner] Skipping retry for ${companyName} (Already in queue). Queue: ${this.queue.length}, Active: ${this.activeRequests}`);
            this.processQueue(); // 큐가 작동하는지 확인
            return;
        }

        console.log(`[JobScanner] Retrying ${companyName}... Queue: ${this.queue.length}, Active: ${this.activeRequests}`);

        // 캐시 강제 만료
        if (this.ratingsCache[companyName]) {
            if (typeof this.ratingsCache[companyName] === 'object') {
                this.ratingsCache[companyName].expired_at = 0; // 즉시 만료
            } else {
                // 레거시를 객체로 변환하고 만료
                this.ratingsCache[companyName] = {
                    rating: this.ratingsCache[companyName],
                    expired_at: 0
                };
            }
            StorageManager.save(this.ratingsCache);
        }

        // 큐에 추가 (평점 강제 가져오기)
        // 드로어에 저장하거나 조회하지 않는 한 여기서 ID를 쉽게 알 수 없음.
        // 하지만 scanVisibleCompanies는 찾을 수 있음.
        // 그러나 드로어에 있는 경우 items 배열에 제대로 저장되지 않았거나 평점만 다시 가져오려는 경우 ID가 없을 수 있음.
        // 큐 항목에는 {name, id, skipRating}이 필요함.
        // DrawerManager 항목에서 ID를 찾거나 평점만 필요한 경우 null을 전달해 보자 (JobScanner는 주로 재무 정보를 위해 ID를 처리함).
        // 사실 JobScanner.processNextItem은 재무 정보 가져오기에 ID를 사용함.
        // 평점만 원하는 경우 BlindAPI.fetchReview에 ID가 반드시 필요한 것은 아님.

        // 가능하면 DrawerManager 항목에서 ID를 조회해 보자.
        const drawerItem = DrawerManager.items.find(it => it.name === companyName);
        // DrawerManager 항목 배열에 ID를 명시적으로 저장하지 않았지만 했을 수도 있음.
        // drawer.js 확인: this.items.push({ name: companyName, rating: null, financial: null, jobs: [], element: newRow });
        // ID가 저장되지 않음.
        // 하지만 잠시만, addItem은 companyId를 받음.
        // 저장해야 할 것 같음.

        // 일단 ID에 null을 전달하자. 재무 정보 재시도가 필요한 경우 ID가 필요할 수 있음.
        // 하지만 사용자는 "블라인드 평점 재시도"를 요청했음.

        this.queue.push({ name: companyName, id: null, skipRating: false });
        this.processQueue();
    },

    init: async function (autoShowDrawer = true) {
        this.ratingsCache = await StorageManager.load();

        // 드로어 즉시 초기화
        if (!this.isDrawerInitialized) {
            DrawerManager.create();
            if (!autoShowDrawer) {
                DrawerManager.hideFull();
            }
            DrawerManager.clear();
            // 기존 이벤트 리스너가 있으면 제거 (로직을 교체하므로 반드시 필요한 것은 아님)
            // 닫기 버튼 설정
            const closeBtn = document.getElementById('close-drawer');
            if (closeBtn) {
                closeBtn.onclick = () => {
                    DrawerManager.drawer.style.display = 'none';
                    DrawerManager.updateButtonAndStatusDisplay();
                };
            }
            this.isDrawerInitialized = true;
        }

        // 초기 스캔
        this.scanVisibleCompanies();

        // 스크롤 리스너
        window.addEventListener('scroll', () => this.handleScroll());

        // 동적 콘텐츠 로딩(무한 스크롤)을 위한 MutationObserver
        const targetNode = document.querySelector('ul[data-cy="job-list"]');
        if (targetNode) {
            const observer = new MutationObserver((mutations) => {
                // subtree: false를 사용하면 직접적인 자식(li 요소)이 추가되는 것만 신경 씀.
                // 주입이 자식 요소 깊은 곳에서 발생하므로 복잡한 필터링이 필요 없음,
                // 따라서 더 이상 이 관찰자를 트리거하지 않음.
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
            // 중요 수정: subtree: false
            // UL에 새로운 LI 요소가 추가될 때만 알고 싶음.
            // 해당 LI 내부의 콘텐츠를 수정할 때(평점 주입)는 알고 싶지 않음.
            observer.observe(targetNode, { childList: true, subtree: false });
            // 목록을 깨끗하게 유지하기 위해 제거도 관찰해야 할까? 지금은 필요 없음.
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