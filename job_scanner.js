
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
    baseDelay: 1500, // Increased base delay
    consecutiveErrors: 0,
    requestCount: 0, // Track number of requests for batch pause

    // Reset Scanner State
    reset: function () {
        this.queue = [];
        this.activeRequests = 0;
        this.totalCompanies = 0;
        this.completedCompanies = 0;
        this.processedCompanies.clear();
        // Do not clear cache as it is valuable
    },

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
                if (rating >= 0) {
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
                } else {
                    document.querySelectorAll(`[data-cy="job-card"] button[data-company-name="${name}"]`).forEach(button => {
                        const container = button.closest('[data-cy="job-card"]');
                        if (container) {
                            UIManager.injectRating(container, rating, name, undefined);
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
                            if (!this.ratingsCache[name]) this.ratingsCache[name] = { rating: 0 };
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
                // Check Expiration
                if (cachedRating.expired_at && Date.now() > cachedRating.expired_at) {
                    cachedRating = null; // Force re-fetch
                } else {
                    cachedFinancial = cachedRating.financial;
                    cachedRating = cachedRating.rating;
                }
            }

            if (cachedRating && cachedRating >= 0) {
                processRating(cachedRating);
                if (cachedFinancial) DrawerManager.updateItem(name, undefined, cachedFinancial);
            } else {
                // Randomized Jitter: 200ms - 600ms
                const delay = Math.floor(Math.random() * (600 - 200 + 1) + 200);
                await sleep(delay);

                // Batch Rate Limiting: Pause for 3 seconds every 30 requests
                if (this.requestCount > 0 && this.requestCount % 30 === 0) {
                    await sleep(3000);
                }

                const result = await BlindAPI.fetchReview(extractCompanyName(name));
                this.requestCount++; // Increment request count
                const { rating } = result;

                // Update cache with rating, preserving hash if exists
                if (!this.ratingsCache[name]) this.ratingsCache[name] = { rating: 0 };
                if (typeof this.ratingsCache[name] !== 'object') this.ratingsCache[name] = { rating: this.ratingsCache[name] };

                this.ratingsCache[name].rating = rating;
                // Set Expiration (7 days)
                this.ratingsCache[name].expired_at = Date.now() + (7 * 24 * 60 * 60 * 1000);

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

            // Mark as completed (failed) to keep counters in sync
            this.completedCompanies++;
            DrawerManager.updateStatus({ type: 'progress', completed: this.completedCompanies, total: this.totalCompanies });

            // Optionally mark in drawer
            DrawerManager.updateItem(name, '-'); // Or 'Error'

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

                // Extract Job Title and Link
                const linkElement = button.closest('a');
                const jobTitle = button.getAttribute('data-position-name');
                const jobLink = linkElement ? linkElement.href : '#';
                const jobLocation = linkElement.querySelector('span[class*="location"]')?.textContent.trim().split('·')
                    .map(v => v.trim())
                    .pop();

                DrawerManager.addItem(name, id, { title: jobTitle, link: jobLink, location: jobLocation });

                if (this.ratingsCache[name] && this.ratingsCache[name].rating >= 0) {
                    // Check if expired
                    const cached = this.ratingsCache[name];
                    let isExpired = false;
                    if (typeof cached === 'object' && cached.expired_at && Date.now() > cached.expired_at) {
                        isExpired = true;
                    }

                    if (!isExpired) {
                        // Valid cache: skip rating fetch
                        this.queue.push({ name, id, skipRating: true });
                    } else {
                        // Expired: fetch everything
                        this.queue.push({ name, id, skipRating: false });
                        // Inject LOADING state
                        const container = button.closest('[data-cy="job-card"]');
                        if (container) {
                            UIManager.injectRating(container, 'LOADING', name);
                        }
                    }
                } else {
                    this.queue.push({ name, id, skipRating: false }); // Push object with ID
                    // Inject LOADING state immediately
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

            // 2. Injection: Always try to inject if cached (handles multiple cards/re-renders)
            if (this.ratingsCache[name]) {
                let rating = this.ratingsCache[name];
                let financial = undefined;

                // Handle object structure
                if (typeof rating === 'object') {
                    // Check Expiration
                    if (rating.expired_at && Date.now() > rating.expired_at) {
                        // Expired: Do not inject, let the queue handle re-fetch (since we added it to queue in step 1 if new, 
                        // BUT if it was already processed in this session, we might need to re-queue?
                        // Actually, scanVisibleCompanies adds to queue if !processedCompanies.has(name).
                        // If it's in cache but expired, we should probably treat it as "not processed" or force queue add?
                        // Wait, if it's in cache, we usually skip rating fetch in queue.
                        // We need to fix the queue logic above too.
                    } else {
                        financial = rating.financial;
                        rating = rating.rating;
                    }
                }

                const container = button.closest('[data-cy="job-card"]');
                // Only inject if valid rating and NOT expired (if expired, rating will be object or we handled it)
                // If expired, rating variable is still the object.

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
        }, 200); // Debounce scroll events
    },

    retryCompany: function (companyName) {
        // Check if already in queue
        if (this.queue.some(item => item.name === companyName)) {
            console.log(`[JobScanner] Skipping retry for ${companyName} (Already in queue). Queue: ${this.queue.length}, Active: ${this.activeRequests}`);
            this.processQueue(); // Ensure queue is moving
            return;
        }

        console.log(`[JobScanner] Retrying ${companyName}... Queue: ${this.queue.length}, Active: ${this.activeRequests}`);

        // Force expire cache
        if (this.ratingsCache[companyName]) {
            if (typeof this.ratingsCache[companyName] === 'object') {
                this.ratingsCache[companyName].expired_at = 0; // Expire immediately
            } else {
                // Convert legacy to object and expire
                this.ratingsCache[companyName] = {
                    rating: this.ratingsCache[companyName],
                    expired_at: 0
                };
            }
            StorageManager.save(this.ratingsCache);
        }

        // Add to queue (force rating fetch)
        // We don't have the ID here easily unless we store it in drawer or lookup.
        // But scanVisibleCompanies can find it. 
        // However, if we are in drawer, we might not have the ID handy if it wasn't stored in items array properly or if we just want to re-fetch rating.
        // The queue item needs {name, id, skipRating}.
        // Let's try to find ID from DrawerManager items or just pass null if only rating is needed (JobScanner handles ID for financial mostly).
        // Actually JobScanner.processNextItem uses ID for financial fetch.
        // If we only want rating, ID is not strictly required for BlindAPI.fetchReview.

        // Let's look up ID from DrawerManager items if possible.
        const drawerItem = DrawerManager.items.find(it => it.name === companyName);
        // We didn't store ID in DrawerManager items explicitly in the array, but we might have.
        // Looking at drawer.js: this.items.push({ name: companyName, rating: null, financial: null, jobs: [], element: newRow });
        // ID is not stored.
        // But wait, `addItem` takes `companyId`.
        // We should probably store it.

        // For now, let's pass null for ID. If we need financial retry, we might need ID.
        // But the user asked for "Blind rating retry".

        this.queue.push({ name: companyName, id: null, skipRating: false });
        this.processQueue();
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
            // Also observe for removal to keep list clean? No need for now.
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