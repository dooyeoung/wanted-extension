const DetailManager = {
    injectFinancialInfo: function (report, rating, companyName) {
        const targetButton = document.querySelector('aside button.wds-slid3e');
        if (!targetButton) {
            return;
        }

        const parent = targetButton.parentNode;

        // 1. Inject Blind Rating (if not exists)
        if (!parent.querySelector('.wanted-rating-blind-info')) {
            const blindDiv = document.createElement('div');
            blindDiv.className = 'wanted-rating-blind-info';
            blindDiv.style.padding = '12px';
            blindDiv.style.backgroundColor = '#fff';
            blindDiv.style.border = '1px solid rgb(229, 236, 255)';
            blindDiv.style.borderRadius = '14px';
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
          <span style="color: #333; font-size: 14px;">블라인드 평점</span>
        </div>
        <div style="display: flex; align-items: center;">
          <span style="font-size: 16px; font-weight: bold; margin-right: 5px;">${rating}</span>
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

            let bgColor = '#f5f5f5'; // Default Gray
            if (netIncome > 0 && operatingIncome > 0) {
                bgColor = 'rgb(158 237 184)'; // Green
            } else if (operatingIncome < 0 && netIncome < 0) {
                bgColor = '#ffccc7'; // Red (light red for background)
            }

            const finDiv = document.createElement('div');
            finDiv.className = 'wanted-rating-financial-info';

            finDiv.innerHTML = `
            <div style="display: flex; width: 100%; 
                text-align: center; 
                border-radius: 14px; 
                border: 1px solid rgb(229, 236, 255);
                overflow: hidden;"
            >
                    <div style="flex: 1;">
                        <div style="font-weight: bold; padding: 8px 0px 6px 0px;">매출</div>
                        <div style="background-color: ${bgColor}; padding: 6px 0px 8px 0px;">${formatMoney(salesAmount)}</div>
                    </div>

                    <div style="flex: 1;">
                        <div style="font-weight: bold; padding: 8px 0px 6px 0px;">영업이익</div>
                        <div style="background-color: ${bgColor}; padding: 6px 0px 8px 0px;">${formatMoney(operatingIncome)}</div>
                    </div>

                    <div style="flex: 1;">
                        <div style="font-weight: bold; padding: 8px 0px 6px 0px;">순이익</div>
                        <div style="background-color: ${bgColor}; padding: 6px 0px 8px 0px;">${formatMoney(netIncome)}</div>
                    </div>
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
            const companyLink = document.querySelector(
                'a[href^="/company/"]' +
                '[data-company-id]' +
                '[data-company-name]' +
                '[data-position-id]' +
                '[data-position-name]' +
                '[data-attribute-id]'
            );

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

                                                if (finResponse.data.financialReport && finResponse.data.financialReport.length > 0) {
                                                    const lastReport = finResponse.data.financialReport[finResponse.data.financialReport.length - 1];
                                                    this.injectFinancialInfo(lastReport, blindRating, companyName);
                                                }
                                            } else {
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
                }
            }

            // Wait before retrying
            await sleep(500);
            retries++;
        }
    }
};
