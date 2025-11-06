function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCompanyName(text) {
  return text.replace(/\s*\(.*?\)/g, '');
}
   
function parseBlindRating(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const el = doc.querySelector('span.star');
  if (!el) return null;
  return el.textContent.match(/\d+(\.\d+)?/)[0]
}

function parseBlindReviewAll(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const reviewAllDiv = doc.querySelector('div.review_all');
  if (!reviewAllDiv) return;

  // 3) 추출된 내용 삽입
  return reviewAllDiv.cloneNode(true) ?? null
}

function injectReviews(element, reviews) {
  if (element.querySelector('.blind-reviews')) return;

  const scoreSpan = document.createElement('div');
  scoreSpan.className = 'blind-reviews';

  scoreSpan.appendChild(reviews);
  element.append(scoreSpan);
}

function injectRating(element, rating, companyName) {
  // newRating = `★ ${rating == -1 ? 0 : rating}`
  newRating = rating;
  if (element.querySelector('.blind-score')){
    
    current = element.querySelector('.blind-score span').textContent
    if (current != newRating ){
      element.querySelector('.blind-score span').textContent = newRating;
    }
    return
  }

  const scoreSpan = document.createElement('div');
  scoreSpan.className = 'blind-score';
  scoreSpan.style.cssText = `
    padding-left: 4px;
    padding-top: 4px;
    color: #ffb400;
    font-size: 0.8125rem;
    line-height: 1.125rem;
    letter-spacing: 0.0194em;
    font-weight: 500;
  `;

    // 별점 텍스트
    const starText = document.createElement('span');
    starText.textContent = newRating;
    scoreSpan.appendChild(starText);

    // Blind 리뷰 페이지 링크
    const link = document.createElement('button');
    link.textContent = '리뷰 보기';
    link.style.cssText = `

      margin-left: 4px;
      color: #0077cc;
      font-weight: bold;
      text-decoration: underline;
      cursor: pointer;
    `;
    scoreSpan.appendChild(link);
    link.addEventListener('click', (e) => {
      e.stopPropagation(); // 부모 a 클릭 방지
      e.preventDefault();
      window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(companyName)}/reviews`, '_blank');
    });

 
  element.append(scoreSpan);
}

async function fetchBlindReview(element, companyName) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_BLIND', company: companyName },
      (response) => {
        if (response?.success && response.html) {
          const rating = parseBlindRating(response.html);
          const reviews = parseBlindReviewAll(response.html);

          if (!rating) {
            resolve(null);
            return;
          }
          resolve({ rating, reviews });
        } else {
          resolve(null);
        }
      }
    );
  });
}


let scoreCache = {}
function init() {
  for (const button of document.querySelectorAll('button[data-company-name]')) {
    const companyName = button.getAttribute('data-company-name');
    if (!scoreCache.hasOwnProperty(companyName)) {
      scoreCache[companyName] = -1;
    }
  }
}

async function fetchScoreByCompanyName(container, companyName){
  if (scoreCache.hasOwnProperty(companyName) && scoreCache[companyName] == -1) {
    const result = await fetchBlindReview(container, companyName);
    if (result) {
      console.log(companyName);
      scoreCache[companyName] = result.rating;
    } 
  }
  injectRating(container, scoreCache[companyName], companyName);
}

function safeLoop() {
  const url = window.location.href;
  // /wd/숫자 → 공고 상세 페이지
  if (/\/wd\/\d+/.test(url)) {
  } 
  // /wdlist → 목록 페이지
  else if (url.includes('/wdlist')) { 
    init();
    for (const button of document.querySelectorAll('button[data-company-name]')) {
      let companyName = extractCompanyName(button.getAttribute('data-company-name'));
      const container = button.parentElement.parentElement;
      fetchScoreByCompanyName(container, companyName);
      sleep(100);
    }
  }
}
safeLoop();


const callback = (mutationList, observer) => {
  for(const mutation of mutationList){
    if (mutation.type == "childList") {
      if (mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach( node => {
          const button = node.querySelector("button[data-company-name]")
          if (button){
            companyName = extractCompanyName(button.getAttribute('data-company-name'));
            // console.log("detect: ", companyName);
            const container = button.parentElement.parentElement;

            if (!scoreCache.hasOwnProperty(companyName)){
              scoreCache[companyName] = -1;
            }
            fetchScoreByCompanyName(container, companyName);
            sleep(100);
          }
        })
      }
    }
  }
};
const el = document.querySelector('ul[data-cy="job-list"]');
const observer = new MutationObserver(callback);
observer.observe(el, {
  childList: true,
  subtree: false,
  attributeOldValue: false,
});