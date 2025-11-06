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
    const scoreDiv = document.createElement('div');
    scoreDiv.className = 'blind-score';
    scoreDiv.style.cssText = `padding-left: 4px; padding-top: 4px; font-size: 0.8125rem; font-weight: 500; display: flex; align-items: center;`;
    const ratingSpan = document.createElement('span');
    const color = getRatingColor(rating);
    ratingSpan.style.cssText = `color: ${color}; margin-right: 4px;`;
    ratingSpan.textContent = `★ ${rating}`;
    scoreDiv.appendChild(ratingSpan);
    const linkButton = document.createElement('button');
    linkButton.textContent = '리뷰 보기';
    linkButton.style.cssText = `color: #0077cc; text-decoration: underline; cursor: pointer; border: none; background: none; padding: 0; font-size: 1em;`;
    linkButton.onclick = (e) => {
      e.stopPropagation(); e.preventDefault();
      window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(extractCompanyName(companyName))}/reviews`, '_blank');
    };
    scoreDiv.appendChild(linkButton);
    element.append(scoreDiv);
  }
};