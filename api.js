const BlindAPI = {
  parseRating: function (html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const el = doc.querySelector('span.star');
    if (!el) return 0;
    const match = el.textContent.match(/\d+(\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
  },

  fetchReview: function (companyName) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'FETCH_BLIND', company: companyName },
        (response) => {
          if (response?.success && response.html) {
            const rating = this.parseRating(response.html);
            resolve({ rating: rating });
          } else {

            if (response?.errorType === 'forbidden') {
              console.error(`Failed to fetch for ${companyName}:`, response?.error || 'forbidden error', response.status);
              resolve({ rating: -3 });
            }
            else if (response?.errorType === 'notfound') {
              console.error(`Failed to fetch for ${companyName}:`, response?.error || 'notfound error', response.status);
              resolve({ rating: -2 });
            }
            else {
              console.error(`Failed to fetch for ${companyName}:`, response?.error || 'Unknown error');
              resolve({ rating: -1 });
            }
          }
        }
      );
    });
  }
};