// --- UI 렌더링 모듈 (페이지 내 별점 표시) ---
function getRatingColor(rating) {
  const numericRating = parseFloat(rating);
  if (numericRating >= 4.0) return 'red';
  if (numericRating >= 3.0) return 'orange';
  return 'gray';
}

const UIManager = {
  injectRating: function (element, rating, companyName) {
    let scoreElement = element.querySelector('.blind-score');

    // Create element if it doesn't exist
    if (!scoreElement) {
      const htmlContent = `
          <div class="blind-score" style="padding-left: 4px; padding-top: 4px; font-size: 0.8125rem; font-weight: 500; display: flex; align-items: center;">
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
            <span style="color: #999; font-size: 0.8em;">블라인드 리뷰 수집중...</span>
        `;
    } else {
      const color = getRatingColor(rating);
      scoreElement.innerHTML = `
            <span style="color: ${color}; margin-right: 4px;">★ ${rating}</span>
            <button class="blind-review-button" style="color: #0077cc; text-decoration: underline; cursor: pointer; border: none; background: none; padding: 0; font-size: 1em;">리뷰 보기</button>
        `;

      // Re-attach event listener for the new button
      const linkButton = scoreElement.querySelector('.blind-review-button');
      if (linkButton) {
        linkButton.onclick = (e) => {
          e.stopPropagation(); e.preventDefault();
          window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');
        };
      }

      // Update attribute
      element.parentElement.parentElement.setAttribute("blind-rating", rating);
    }
  }
};