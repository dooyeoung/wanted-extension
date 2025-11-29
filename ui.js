// --- UI 렌더링 모듈 (페이지 내 별점 표시) ---
function getRatingColor(rating) {
  const numericRating = parseFloat(rating);
  if (numericRating >= 4.0) return 'red';
  if (numericRating >= 3.0) return 'orange';
  return 'gray';
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
      const color = getRatingColor(rating);

      // Line 1: Icon + Rating
      let line1Html = `
        <div style="display: flex; align-items: center; margin-bottom: 4px;">
          <img src="https://static.teamblind.com/img/www/favicon.ico" width="14" height="14" style="margin-right: 4px; vertical-align: middle; cursor: pointer;" class="blind-icon-link" title="블라인드 리뷰 보기">
          <span style="color: ${color};">★ ${rating}</span>
        </div>
      `;

      // Line 2: Financial Data (if available)
      let line2Html = '';
      if (financial) {
        const { salesAmount, operatingIncome, netIncome } = financial;
        const bgColor = netIncome > 0 ? 'rgb(158 237 184)' : (netIncome < 0 ? '#f5f5f5' : 'transparent');

        line2Html = `
          <div style="display: flex; gap: 6px;  border-radius: 3px;">
            <table style="width: 100%; border: 1px solid #ccc;">
              <thead>
                <th style="padding: 2px 4px;">매출</th>
                <th style="padding: 2px 4px;">영업이익</th>
                <th style="padding: 2px 4px;">순이익</th>
              </thead>
              <tbody>
                <tr style="text-align: center; background-color: ${bgColor};">
                  <td style="padding: 2px 4px;">${formatMoney(salesAmount)}</td>
                  <td style="padding: 2px 4px;">${formatMoney(operatingIncome)}</td>
                  <td style="padding: 2px 4px;">${formatMoney(netIncome)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        `;
      }

      scoreElement.innerHTML = line1Html + line2Html;

      // Re-attach event listener for the icon
      const iconLink = scoreElement.querySelector('.blind-icon-link');
      if (iconLink) {
        iconLink.onclick = (e) => {
          e.stopPropagation(); e.preventDefault();
          window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');
        };
      }

      // Update attribute
      element.parentElement.parentElement.setAttribute("blind-rating", rating);
    }
  }
};