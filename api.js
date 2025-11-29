const BlindAPI = {
  parseRating: function (html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const el = doc.querySelector('span.star');
    if (!el) return null;
    const match = el.textContent.match(/\d+(\.\d+)?/);
    return match ? match[0] : null;
  },
  fetchReview: function (companyName) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'FETCH_BLIND', company: companyName },
        (response) => {
          if (response?.success && response.html) {
            const rating = this.parseRating(response.html);
            resolve({ rating: rating || '-' });
          } else {
            console.error(`Failed to fetch for ${companyName}:`, response?.error || 'Unknown error');
            resolve({ rating: '-' });
          }
        }
      );
    });
  }
};