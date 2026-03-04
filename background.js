// Background service worker
// Currently, mostly used for potential background messaging or lifecycle events
chrome.runtime.onInstalled.addListener(() => {
  console.log("API Reverse Engineer AI extension installed.");
});
