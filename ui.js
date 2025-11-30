// --- UI 렌더링 모듈 (페이지 내 별점 표시) ---
function getRatingColor(rating) {
  const numericRating = parseFloat(rating);
  return 'black';
}

function formatMoney(amount) {
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
}

const UIManager = {
  injectRating: function (element, rating, companyName, financial) {
    let scoreElement = element.querySelector('.blind-score');

    // Create element if it doesn't exist
    if (!scoreElement) {
      const htmlContent = `
          <div class="blind-score" style="padding-left: 4px; padding-top: 4px; font-size: 0.8125rem; font-weight: 500;">
          </div>
        `;
      element.insertAdjacentHTML('beforeend', htmlContent);
      scoreElement = element.querySelector('.blind-score');
      // Set attribute on container only once
      element.parentElement.parentElement.setAttribute("blind-rating", rating === 'LOADING' ? 0 : rating);
    }

    // Update content based on rating state
    if (rating === 'LOADING') {
      scoreElement.innerHTML = `
            <span style="color: #999;">데이터 수집중...</span>
        `;
    } else {
      let displayRating = rating;
      let fontWeight = '400';

      if (rating !== '-') {
        const parsedRating = parseFloat(rating);
        if (!isNaN(parsedRating)) {
          displayRating = parsedRating;
          fontWeight = parsedRating >= 4 ? '700' : '400';
        }
      } else {
        displayRating = '-';
      }

      // Line 1: Icon + Rating
      let line1Html = `
      <div 
        class="blind-icon-link"
        title="블라인드 리뷰 보러가기" 
        style="padding: 8px; 
        background-color: rgb(255, 255, 255); 
        border: 1px solid rgb(229, 236, 255); 
        border-radius: 14px; 
        display: flex; 
        align-items: center; 
        justify-content: space-between; 
        cursor: pointer;
        margin-top: 8px;
        "
      >
        <div style="display: flex; align-items: center;">
          <img src="https://static.teamblind.com/img/www/favicon.ico" width="20" height="20" style="margin-right: 8px;">
          <span style="color: #333; font-size: 14px;">블라인드 평점</span>
        </div>
        <div style="display: flex; align-items: center;">
          <span style="font-size: 16px; font-weight: ${fontWeight}; margin-right: 5px;">${displayRating}</span>
        </div>
      </div>
      `;

      // Line 2: Financial Data (if available)
      let line2Html = '';
      if (financial) {
        const { salesAmount, operatingIncome, netIncome } = financial;
        let bgColor = '#f5f5f5'; // Default Gray
        if (netIncome > 0 && operatingIncome > 0) {
          bgColor = 'rgb(158 237 184)'; // Green
        } else if (operatingIncome < 0 && netIncome < 0) {
          bgColor = '#ffccc7'; // Red (light red for background)
        }

        line2Html = `
          <div 
            style="display: flex; width: 100%; 
            text-align: center; 
            border-radius: 14px; 
            border: 1px solid rgb(229, 236, 255);
            overflow: hidden;
            margin-top: 8px;
            "
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
      }

      scoreElement.innerHTML = line1Html + line2Html;

      // Re-attach event listener for the icon
      const iconLink = scoreElement.querySelector('.blind-icon-link');
      if (iconLink) {
        iconLink.onclick = (e) => {
          e.stopPropagation(); e.preventDefault();
          chrome.runtime.sendMessage({
            type: 'GA_EVENT',
            eventName: 'click_blind_icon',
            params: { company: companyName }
          });
          window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');
        };
      }

      // Update attribute
      element.parentElement.parentElement.setAttribute("blind-rating", rating);
    }
  }
};