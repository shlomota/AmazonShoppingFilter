document.addEventListener("DOMContentLoaded", () => {
  const apiKeyInput = document.getElementById("apiKey");
  const saveKeyButton = document.getElementById("saveKey");
  const enableExtensionCheckbox = document.getElementById("enableExtension");
  const statusMessage = document.getElementById("statusMessage");

  // Load saved API key and extension status
  chrome.storage.local.get(["openaiApiKey", "extensionEnabled"], (result) => {
    if (result.openaiApiKey) {
      apiKeyInput.value = result.openaiApiKey;
    }
    if (typeof result.extensionEnabled !== "undefined") {
      enableExtensionCheckbox.checked = result.extensionEnabled;
    }
  });

  // Save API key
  saveKeyButton.addEventListener("click", () => {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.local.set({ openaiApiKey: apiKey }, () => {
        statusMessage.textContent = "API Key saved!";
        statusMessage.style.color = "green";
      });
    } else {
      statusMessage.textContent = "Please enter a valid API Key.";
      statusMessage.style.color = "red";
    }
  });

  // Toggle extension enabled/disabled
  enableExtensionCheckbox.addEventListener("change", () => {
    const enabled = enableExtensionCheckbox.checked;
    chrome.storage.local.set({ extensionEnabled: enabled }, () => {
      statusMessage.textContent = `Extension ${enabled ? "enabled" : "disabled"}!`;
      statusMessage.style.color = "green";
    });
  });
});
