// --- 스토리지 모듈 ---
const StorageManager = {
  key: 'companyRatingsCache',
  ttlDays: 7, // New property for TTL

  save: async function(data) {
    try {
      const now = Date.now(); // Current timestamp
      const itemToStore = {
        data: data,
        timestamp: now
      };
      await chrome.storage.local.set({ [this.key]: itemToStore });
    } catch (e) {
      console.error("Error saving to chrome.storage.local", e);
    }
  },

  load: async function() {
    try {
      const result = await chrome.storage.local.get(this.key);
      const storedItem = result[this.key];

      if (storedItem && storedItem.data && storedItem.timestamp) {
        const now = Date.now();
        const ageMs = now - storedItem.timestamp;
        const ttlMs = this.ttlDays * 24 * 60 * 60 * 1000; // Convert days to milliseconds

        if (ageMs < ttlMs) {
          return storedItem.data; // Cache is fresh
        } else {
          console.log("Cache expired, re-fetching data.");
          return {}; // Cache expired
        }
      }
      return {}; // No data or invalid structure
    } catch (e) {
      console.error("Error reading from chrome.storage.local", e);
      return {};
    }
  }
};