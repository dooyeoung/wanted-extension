// --- UI 렌더링 모듈 (페이지 내 별점 표시) ---
function getRatingColor(rating) {
  const numericRating = parseFloat(rating);
  if (numericRating >= 4.0) return 'red';
  if (numericRating >= 3.0) return 'orange';
  return 'gray';
}

const UIManager = {
  injectRating: function(element, rating, companyName) {
    if (element.querySelector('.blind-score')) return;
    const color = getRatingColor(rating);
    const htmlContent = `
      <div class="blind-score" style="padding-left: 4px; padding-top: 4px; font-size: 0.8125rem; font-weight: 500; display: flex; align-items: center;">
        <span style="color: ${color}; margin-right: 4px;">★ ${rating}</span>
        <button class="blind-review-button" style="color: #0077cc; text-decoration: underline; cursor: pointer; border: none; background: none; padding: 0; font-size: 1em;">리뷰 보기</button>
      </div>
    `;
    element.insertAdjacentHTML('beforeend', htmlContent);
    const linkButton = element.querySelector('.blind-review-button');
    if (linkButton) {
      linkButton.onclick = (e) => {
        e.stopPropagation(); e.preventDefault();
        window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');
      };
    }
  }
};