// --- 스토리지 모듈 ---
const StorageManager = {
  key: 'companyRatingsCache',

  save: async function (data) {
    try {
      await chrome.storage.local.set({ [this.key]: data });
    } catch (e) {
      console.error("Error saving to chrome.storage.local", e);
    }
  },

  load: async function () {
    try {
      const result = await chrome.storage.local.get(this.key);
      return result[this.key] || {};
    } catch (e) {
      console.error("Error reading from chrome.storage.local", e);
      return {};
    }
  }
};