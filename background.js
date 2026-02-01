chrome.runtime.onInstalled.addListener(() => {
  console.log('Lens Extension Installed');
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});


// Listener for messages from content scripts or popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "downloadAsset") {
    // Logic for downloading assets if needed via chrome.downloads (requires permission)
    // For now, we'll handle downloads in the UI/Content script using <a> blobs
  }
});
