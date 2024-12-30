try {
  // Import scripts
  importScripts("api.js", "consts.js");
} catch (error) {
  console.error("Error importing scripts:", error);
}

// Main logic for handling messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "filter") {
    log("Filter action received"); // Use the `log` function from consts.js
    log(`Using filter criteria: ${DEFAULT_FILTER}`); // Use `DEFAULT_FILTER` constant

    fetchRelevantProducts(message.products, DEFAULT_FILTER, OPENAI_API_KEY)
      .then((result) => {
        log(`Filtered products: ${result.length} relevant items.`);
        sendResponse(result);
      })
      .catch((error) => console.error("Error in filtering:", error));
    return true; // Keeps the sendResponse channel open for async responses
  }
});
