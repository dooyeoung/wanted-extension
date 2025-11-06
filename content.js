function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function extractCompanyName(text) {
  return text.replace(/\s*\(.*?\)/g, '');
}
   

// --- Blind API 관련 모듈 ---

const BlindAPI = {
  /**
   * HTML 문자열에서 별점을 파싱합니다.
   * @param {string} html - Blind 페이지의 HTML
   * @returns {string|null} - 파싱된 별점 또는 null
   */
  parseRating: function(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const el = doc.querySelector('span.star');
    if (!el) return null;
    const match = el.textContent.match(/\d+(\.\d+)?/);
    return match ? match[0] : null;
  },

  /**
   * 백그라운드 스크립트를 통해 Blind 리뷰 정보를 가져옵니다.
   * @param {string} companyName - 조회할 회사 이름
   * @returns {Promise<{rating: string}|null>} - {별점} 객체 또는 null
   */
  fetchReview: function(companyName) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'FETCH_BLIND', company: companyName },
        (response) => {
          if (response?.success && response.html) {
            const rating = this.parseRating(response.html);
            if (!rating) {
              resolve(null);
              return;
            }
            resolve({ rating });
          } else {
            resolve(null);
          }
        }
      );
    });
  }
};


// --- UI 렌더링 관련 모듈 ---

const UIManager = {
  /**
   * 지정된 요소에 별점과 리뷰 보기 버튼을 삽입합니다.
   * @param {HTMLElement} element - 별점을 삽입할 부모 요소
   * @param {string} rating - 표시할 별점
   * @param {string} companyName - 회사 이름 (리뷰 보기 링크에 사용)
   */
  injectRating: function(element, rating, companyName) {
    // 이미 별점 요소가 있으면 업데이트만 수행
    const existingScore = element.querySelector('.blind-score');
    if (existingScore) {
      const starText = existingScore.querySelector('span');
      if (starText && starText.textContent !== rating) {
        starText.textContent = rating;
      }
      return;
    }

    const scoreSpan = document.createElement('div');
    scoreSpan.className = 'blind-score';
    scoreSpan.style.cssText = `
      padding-left: 4px;
      padding-top: 4px;
      color: #ffb400;
      font-size: 0.8125rem;
      line-height: 1.125rem;
      font-weight: 500;
    `;

    // 별점 텍스트
    const starText = document.createElement('span');
    starText.textContent = `★ ${rating}`;
    scoreSpan.appendChild(starText);

    // 리뷰 보기 버튼
    const link = document.createElement('button');
    link.textContent = '리뷰 보기';
    link.style.cssText = `
      margin-left: 4px;
      color: #0077cc;
      font-weight: bold;
      text-decoration: underline;
      cursor: pointer;
      border: none;
      background: none;
      padding: 0;
    `;
    link.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      window.open(`https://www.teamblind.com/kr/company/${encodeURIComponent(companyName)}/reviews`, '_blank');
    });
    scoreSpan.appendChild(link);

    element.append(scoreSpan);
  }
};


// --- 메인 애플리케이션 모듈 ---

const JobScanner = {
  scoreCache: {}, // 회사별 평점 캐시

  /**
   * 특정 채용 공고 카드에서 회사 이름을 찾아 평점을 가져오고 UI에 삽입합니다.
   * @param {HTMLElement} jobCardNode - 채용 공고 카드 최상위 노드
   */
  processJobCard: async function(jobCardNode) {
    const button = jobCardNode.querySelector('button[data-company-name]');
    if (!button) return;

    const companyNameRaw = button.getAttribute('data-company-name');
    const companyName = extractCompanyName(companyNameRaw);
    const container = button.parentElement.parentElement;

    // 캐시 확인 및 API 호출
    if (!this.scoreCache.hasOwnProperty(companyName)) {
      this.scoreCache[companyName] = null; // API 호출 중임을 표시
      const result = await BlindAPI.fetchReview(companyName);
      if (result) {
        this.scoreCache[companyName] = result.rating;
      }
    }
    
    // UI에 별점 삽입
    const rating = this.scoreCache[companyName];
    if (rating) {
      UIManager.injectRating(container, rating, companyName);
    }
    
    await sleep(100); // API 호출 부하를 줄이기 위한 지연
  },

  /**
   * MutationObserver 콜백: 동적으로 추가되는 채용 공고를 처리합니다.
   * @param {MutationRecord[]} mutationList - 변경 사항 목록
   */
  handleMutation: function(mutationList) {
    for (const mutation of mutationList) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        mutation.addedNodes.forEach(node => {
          // node가 HTMLElement인지 확인
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processJobCard(node);
          }
        });
      }
    }
  },

  /**
   * 애플리케이션을 초기화하고 실행합니다.
   */
  init: function() {
    const url = window.location.href;
    
    // 채용 목록 페이지에서만 실행
    if (url.includes('/wdlist')) {
      // 1. 이미 로드된 채용 공고 처리
      document.querySelectorAll('ul[data-cy="job-list"] > li').forEach(jobCard => {
        this.processJobCard(jobCard);
      });

      // 2. 동적으로 로드되는 채-용 공고를 감시할 Observer 설정
      const targetNode = document.querySelector('ul[data-cy="job-list"]');
      if (targetNode) {
        const observer = new MutationObserver(this.handleMutation.bind(this));
        observer.observe(targetNode, {
          childList: true,
          subtree: false 
        });
      }
    }
  }
};

// --- 애플리케이션 실행 ---
JobScanner.init();
