// --- 유틸리티 함수 ---

function sortJobList(ulElement) {
  if (!ulElement) {
    console.error("UL element not found for sorting.");
    return;
  }

  const listItems = Array.from(ulElement.children); // Get all li children

  listItems.sort((a, b) => {
    const ratingA = parseFloat(a.getAttribute('blind-rating')) || 0;
    const ratingB = parseFloat(b.getAttribute('blind-rating')) || 0;
    return ratingB - ratingA; // Descending order (highest rating first)
  });

  // Clear existing list items and append sorted ones
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
      // Remove selected class from all siblings (including native ones)
      sortFilterUl.querySelectorAll('li').forEach(li => {
        li.classList.remove('SortFilter_SortFilter__list__item__selected__k5thb');
        li.querySelector('span')?.classList.remove('SortFilter_SortFilter__list__item__selected__text__u7klW', 'wds-12dtfjt');
        li.querySelector('span')?.classList.add('wds-83zqyc');
      });

      // Add selected class to the clicked item (our custom button)
      const parentLi = event.currentTarget.closest('li');
      parentLi.classList.add('SortFilter_SortFilter__list__item__selected__k5thb');
      parentLi.querySelector('span')?.classList.add('SortFilter_SortFilter__list__item__selected__text__u7klW', 'wds-12dtfjt');
      parentLi.querySelector('span')?.classList.remove('wds-83zqyc');

      const jobListUl = document.querySelector('ul[data-cy="job-list"]');
      sortJobList(jobListUl);
    };
  }
}


// --- URL Observer & Page Transition ---
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

      // Check if pathname is same but search params changed (Filter change)
      if (currentUrl.pathname === previousUrl.pathname && currentUrl.search !== previousUrl.search) {
        shouldReset = true;
      }
      // Check if we moved from another page TO listing page (e.g. from detail to list)
      // In this case, we usually don't want to reset if we just went back.
      // But if we came from a different listing category, pathname would change.
      // If pathname changes (e.g. /wdlist/518 -> /wdlist/519), we SHOULD reset.
      if (currentUrl.pathname !== previousUrl.pathname) {
        shouldReset = true;
      }
    }

    // Ensure drawer is initialized and visible
    if (!JobScanner.isDrawerInitialized) {
      await JobScanner.init(true);
    } else {
      DrawerManager.show();
    }

    if (shouldReset) {
      JobScanner.reset();
      DrawerManager.clear();
      // Do NOT scan immediately. Wait for MutationObserver to detect new content.
      // Scanning now might process old DOM elements before they are removed.
    } else {
      // Trigger scan if not resetting (e.g. initial load or simple navigation)
      JobScanner.scanVisibleCompanies();
    }

  } else if (isDetailPage) {
    // Ensure drawer is initialized (but hidden)
    if (!JobScanner.isDrawerInitialized) {
      await JobScanner.init(false);
      DrawerManager.hideFull(); // Explicitly hide everything after init
    } else {
      DrawerManager.hideFull();
    }

    // Fetch info for the new company
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
  // Initial check
  await handlePageTransition();

  // Start observing
  observeUrlChanges();
})();