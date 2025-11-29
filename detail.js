const DetailManager = {
    injectFinancialInfo: function (report, rating, companyName) {
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
            blindDiv.style.padding = '12px';
            blindDiv.style.backgroundColor = '#fff';
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
            finDiv.style.padding = '12px';
            finDiv.style.backgroundColor = '#f8f9fa';
            finDiv.style.borderRadius = '8px';
            finDiv.style.border = '1px solid #e1e2e3';
            finDiv.style.fontSize = '14px';
            finDiv.style.color = '#333';

            finDiv.innerHTML = `
        <div style="font-weight: bold; margin-bottom: 8px; color: #171717;">${year}년 재무정보</div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="">매출액</span>
          <span style="font-weight: 600;">${formatMoney(salesAmount)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <span style="">영업이익</span>
          <span style="font-weight: 600; color: ${operatingIncome > 0 ? '#00a8ff' : (operatingIncome < 0 && netIncome < 0 ? '#ff4d4f' : '#888')};">${formatMoney(operatingIncome)}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="">당기순이익</span>
          <span style="font-weight: 600; color: ${netIncome > 0 ? '#00a8ff' : (operatingIncome < 0 && netIncome < 0 ? '#ff4d4f' : '#888')};">${formatMoney(netIncome)}</span>
        </div>
      `;

            // Insert after the Blind div (which is nextSibling of button now)
            const blindDiv = parent.querySelector('.wanted-rating-blind-info');
            if (blindDiv) {
                parent.insertBefore(finDiv, blindDiv.nextSibling);
            } else {
                parent.insertBefore(finDiv, targetButton.nextSibling);
            }
        }
    },

    fetchAndRender: async function () {
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
                                                    this.injectFinancialInfo(lastReport, blindRating, companyName);
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
    }
};
