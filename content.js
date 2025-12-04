// --- 유틸리티 함수 ---

function sortJobList(ulElement) {
  if (!ulElement) {
    console.error("UL element not found for sorting.");
    return;
  }

  const listItems = Array.from(ulElement.children); // 모든 li 자식 요소 가져오기

  listItems.sort((a, b) => {
    const ratingA = parseFloat(a.getAttribute('blind-rating')) || 0;
    const ratingB = parseFloat(b.getAttribute('blind-rating')) || 0;
    return ratingB - ratingA; // 내림차순 정렬 (높은 평점 우선)
  });

  // 기존 목록 항목 지우고 정렬된 항목 추가
  listItems.forEach(item => ulElement.appendChild(item));
}

function addBlindReviewSortButton() {
  const sortFilterUl = document.querySelector('ul.SortFilter_SortFilter__list__QuSd6');
  if (!sortFilterUl) {
    return;
  }

  const newSortItemHtml = `
    <li class="SortFilter_SortFilter__list__item__CJk9X" style="width: 100px">
      <button type="button" id="sort-by-blind-review">
        <span class="SortFilter_SortFilter__list__item__text__lJESk wds-83zqyc">블라인드 리뷰순</span>
      </button>
    </li>
  `;
  sortFilterUl.insertAdjacentHTML('beforeend', newSortItemHtml);

  const blindReviewSortButton = document.getElementById('sort-by-blind-review');
  if (blindReviewSortButton) {
    blindReviewSortButton.onclick = (event) => {
      // 모든 형제 요소에서 selected 클래스 제거 (기본 요소 포함)
      sortFilterUl.querySelectorAll('li').forEach(li => {
        li.classList.remove('SortFilter_SortFilter__list__item__selected__k5thb');
        li.querySelector('span')?.classList.remove('SortFilter_SortFilter__list__item__selected__text__u7klW', 'wds-12dtfjt');
        li.querySelector('span')?.classList.add('wds-83zqyc');
      });

      // 클릭된 항목에 selected 클래스 추가 (사용자 정의 버튼)
      const parentLi = event.currentTarget.closest('li');
      parentLi.classList.add('SortFilter_SortFilter__list__item__selected__k5thb');
      parentLi.querySelector('span')?.classList.add('SortFilter_SortFilter__list__item__selected__text__u7klW', 'wds-12dtfjt');
      parentLi.querySelector('span')?.classList.remove('wds-83zqyc');

      const jobListUl = document.querySelector('ul[data-cy="job-list"]');
      sortJobList(jobListUl);
    };
  }
}


// --- URL 관찰자 및 페이지 전환 ---
let lastUrl = location.href;

const handlePageTransition = async (previousUrlString) => {
  const isListingPage = window.location.pathname.startsWith('/wdlist');
  const isDetailPage = window.location.pathname.startsWith('/wd/') && !isNaN(parseInt(window.location.pathname.split('/')[2]));

  chrome.runtime.sendMessage({
    type: 'GA_EVENT',
    eventName: 'page_view',
    params: {
      page_path: window.location.pathname + window.location.search,
      page_location: window.location.href,
      page_title: document.title,
      page_type: isListingPage ? 'listing' : (isDetailPage ? 'detail' : 'other')
    }
  });

  if (isListingPage) {
    let shouldReset = false;

    if (previousUrlString) {
      const currentUrl = new URL(window.location.href);
      const previousUrl = new URL(previousUrlString);

      // 경로명은 같지만 검색 매개변수가 변경되었는지 확인 (필터 변경)
      if (currentUrl.pathname === previousUrl.pathname && currentUrl.search !== previousUrl.search) {
        shouldReset = true;
      }
      // 다른 페이지에서 목록 페이지로 이동했는지 확인 (예: 상세 페이지에서 목록으로)
      // 이 경우, 단순히 뒤로 가기한 것이라면 초기화하지 않음.
      // 하지만 다른 목록 카테고리에서 왔다면 경로명이 변경됨.
      // 경로명이 변경되면 (예: /wdlist/518 -> /wdlist/519) 초기화해야 함.
      if (currentUrl.pathname !== previousUrl.pathname) {
        shouldReset = true;
      }
    }

    // 드로어가 초기화되고 표시되는지 확인
    if (!JobScanner.isDrawerInitialized) {
      await JobScanner.init(true);
    } else {
      DrawerManager.show();
    }

    if (shouldReset) {
      JobScanner.reset();
      DrawerManager.clear();
      // 즉시 스캔하지 않음. MutationObserver가 새 콘텐츠를 감지할 때까지 대기.
      // 지금 스캔하면 제거되기 전의 이전 DOM 요소를 처리할 수 있음.
    } else {
      // 초기화하지 않는 경우 스캔 트리거 (예: 초기 로드 또는 단순 탐색)
      JobScanner.scanVisibleCompanies();
    }

  } else if (isDetailPage) {
    // 드로어 초기화 확인 (숨김 상태)
    if (!JobScanner.isDrawerInitialized) {
      await JobScanner.init(false);
      DrawerManager.hideFull(); // 초기화 후 명시적으로 모두 숨김
    } else {
      DrawerManager.hideFull();
    }

    // 새 회사 정보 가져오기
    await DetailManager.fetchAndRender();
  }
};

const observeUrlChanges = () => {
  const observer = new MutationObserver(() => {
    if (location.href !== lastUrl) {
      const previousUrl = lastUrl;
      lastUrl = location.href;
      handlePageTransition(previousUrl);
    }
  });
  observer.observe(document, { subtree: true, childList: true });
};

(async () => {
  // 초기 확인
  await handlePageTransition();

  // 관찰 시작
  observeUrlChanges();
})();