// Constants
const DEFAULT_FILTER = "hard plastic and for adults";

let OPENAI_API_KEY = null;
let EXTENSION_ENABLED = true;
let filterConditions = JSON.parse(localStorage.getItem('filterConditions')) || [];
let productLimit = JSON.parse(localStorage.getItem('productLimit')) || Infinity;

// Utility log function
function log(message) {
  console.log(`[Amazon Filter Extension]: ${message}`);
}

// Fetch relevant products from OpenAI API
async function fetchRelevantProducts(products, filterCriteria, openaiApiKey) {
  log("Calling OpenAI API...");

  const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
  const productSchema = {
    type: "object",
    properties: {
      relevant: {
        type: "array",
        items: {
          type: "boolean",
        },
      },
    },
    required: ["relevant"],
    additionalProperties: false,
  };

  const limitedProducts = products.slice(0, productLimit);
  log(`Sending ${limitedProducts.length} products to OpenAI for filtering.`);

  const messages = [
    {
      role: "system",
      content: `You are a product filtering assistant. Your task is to evaluate the relevance of each product based on the user's criteria: "${filterCriteria}".
For each product, carefully consider all details, even if they only hint at some criteria. 

Only mark a product as 'relevant: true' if it satisfies **all criteria completely**. If there is any ambiguity or missing information about a criterion, mark the product as 'relevant: false'.

Respond with a JSON object containing an array of booleans under the key 'relevant', where each boolean corresponds to whether the product at the same index in the input list is relevant.

Example Input:
Products:
[
    "Snow Sled for Kid and Adult Includes Resistant Handles and Ropes, plastic",
    "Tube for Kids Sledding",
    "Foam sled for Adults with Handles",
    "Hard durable sled for Adults"
]

Criteria: "hard plastic and for adults"

Example Output:
{
    "relevant": [
        true,
        false,
        false,
        true
    ]
}

Now, analyze the following products:
Products:
${JSON.stringify(limitedProducts.map((p) => p.name), null, 2)}`,
    },
    {
      role: "user",
      content: JSON.stringify(limitedProducts.map((p) => p.name)),
    },
  ];

  try {
    const startTime = performance.now();
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-2024-08-06",
        messages: messages,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "product_filter",
            strict: true,
            schema: productSchema,
          },
        },
      }),
    });

    const responseText = await response.text();
    log(`Raw API response: ${responseText}`);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} - ${responseText}`);
    }

    const result = JSON.parse(responseText);
    log(`Parsed response: ${JSON.stringify(result)}`);

    if (!result.choices || !result.choices[0]) {
      throw new Error("Invalid API response: 'choices[0]' is missing.");
    }

    const messageContent = result.choices[0].message.content;
    log(`Message content before parsing: ${messageContent}`);

    const parsedContent = JSON.parse(messageContent);
    if (!parsedContent.relevant || !Array.isArray(parsedContent.relevant)) {
      throw new Error("Invalid API response: 'relevant' is missing or not an array.");
    }

    const endTime = performance.now();
    log(`API call completed in ${(endTime - startTime).toFixed(2)} ms.`);

    return limitedProducts.filter((_, index) => parsedContent.relevant[index]);
  } catch (error) {
    log(`Error during OpenAI API call: ${error.message}`);
    throw error;
  }
}

// Create and setup UI
function setupUI() {
  const products = [];
  document.querySelectorAll("div.s-result-item[data-component-type='s-search-result']").forEach((item) => {
    const titleElement = item.querySelector("h2 span");
    if (titleElement) {
      products.push({
        name: titleElement.textContent.trim(),
        element: item,
      });
    }
  });

  log(`Found ${products.length} products on the page.`);

  const filterContainer = document.createElement('div');
  filterContainer.style.position = "fixed";
  filterContainer.style.top = "12%";
  filterContainer.style.right = "10px";
  filterContainer.style.zIndex = "1000";
  filterContainer.style.backgroundColor = "#f9f9f9";
  filterContainer.style.padding = "10px";
  filterContainer.style.border = "1px solid #ccc";
  filterContainer.style.borderRadius = "5px";
  filterContainer.style.boxShadow = "0 4px 6px rgba(0, 0, 0, 0.1)";

  const conditionInput = document.createElement('input');
  conditionInput.type = "text";
  conditionInput.placeholder = "Enter a condition";
  conditionInput.style.marginBottom = "10px";
  conditionInput.style.marginLeft = "10px";
  conditionInput.style.width = "calc(100% - 20px)";
  conditionInput.style.padding = "5px";
  conditionInput.style.border = "1px solid #ccc";
  conditionInput.style.borderRadius = "3px";

  const addConditionButton = document.createElement('button');
  addConditionButton.textContent = "Add Condition";
  addConditionButton.style.marginRight = "5px";

  const clearConditionsButton = document.createElement('button');
  clearConditionsButton.textContent = "Clear Conditions";

  const conditionsList = document.createElement('ul');
  conditionsList.style.listStyle = "none";
  conditionsList.style.padding = "0";
  conditionsList.style.margin = "10px 0";
  conditionsList.style.marginLeft = "10px";

  const filterButton = document.createElement('button');
  filterButton.textContent = "Apply AI Filter";
  filterButton.style.backgroundColor = OPENAI_API_KEY ? "#0073e6" : "#cccccc";
  filterButton.style.color = "white";
  filterButton.style.border = "none";
  filterButton.style.borderRadius = "5px";
  filterButton.style.padding = "5px 10px";
  filterButton.style.cursor = OPENAI_API_KEY ? "pointer" : "not-allowed";
  filterButton.style.marginTop = "10px";
  filterButton.disabled = !OPENAI_API_KEY;

  const statusMessage = document.createElement('div');
  statusMessage.style.marginTop = "10px";
  statusMessage.style.fontSize = "12px";
  statusMessage.style.color = "#555";
  filterContainer.appendChild(statusMessage);

  // Load previous conditions
  filterConditions.forEach((condition) => {
    const listItem = document.createElement('li');
    listItem.textContent = condition;

    const removeButton = document.createElement('button');
    removeButton.textContent = "x";
    removeButton.style.marginLeft = "10px";
    removeButton.style.color = "red";
    removeButton.style.border = "none";
    removeButton.style.cursor = "pointer";

    removeButton.addEventListener('click', () => {
      filterConditions = filterConditions.filter((c) => c !== condition);
      listItem.remove();
      localStorage.setItem('filterConditions', JSON.stringify(filterConditions));
    });

    listItem.appendChild(removeButton);
    conditionsList.appendChild(listItem);
  });

  // Add functionality
  addConditionButton.addEventListener('click', () => {
    const condition = conditionInput.value.trim();
    if (condition) {
      filterConditions.push(condition);
      localStorage.setItem('filterConditions', JSON.stringify(filterConditions));

      const listItem = document.createElement('li');
      listItem.textContent = condition;

      const removeButton = document.createElement('button');
      removeButton.textContent = "x";
      removeButton.style.marginLeft = "10px";
      removeButton.style.color = "red";
      removeButton.style.border = "none";
      removeButton.style.cursor = "pointer";

      removeButton.addEventListener('click', () => {
        filterConditions = filterConditions.filter((c) => c !== condition);
        listItem.remove();
        localStorage.setItem('filterConditions', JSON.stringify(filterConditions));
      });

      listItem.appendChild(removeButton);
      conditionsList.appendChild(listItem);
      conditionInput.value = "";
    }
  });

  clearConditionsButton.addEventListener('click', () => {
    filterConditions = [];
    conditionsList.innerHTML = "";
    localStorage.setItem('filterConditions', JSON.stringify(filterConditions));
  });

  filterButton.addEventListener('click', async () => {
    log("Filter button clicked. Applying AI filter...");
    const combinedFilter = filterConditions.join(" and ") || DEFAULT_FILTER;
    log(`Using filter criteria: ${combinedFilter}`);

    statusMessage.textContent = "Running...";

    try {
      const relevantProducts = await fetchRelevantProducts(products, combinedFilter, OPENAI_API_KEY);

      log(`Filtering complete. ${relevantProducts.length} relevant products identified.`);

      let keptCount = 0;
      products.forEach((product) => {
        if (relevantProducts.includes(product)) {
          keptCount++;
        } else {
          product.element.style.display = "none";
        }
      });

      document.querySelectorAll("div.s-main-slot > div").forEach((section) => {
        const sectionHeader = section.querySelector("h2.a-size-medium-plus");
        if (sectionHeader) {
          const headerText = sectionHeader.textContent.trim().toLowerCase();
          if (!headerText.startsWith("results") && !headerText.startsWith("more results")) {
            log(`Removed non-result section with header: ${headerText}`);
            section.remove();
          }
        } else {
          const sectionClass = section.className || "";
          if (sectionClass.includes("s-result-item")) {
            log("Preserved a result section without a header.");
          } else {
            section.remove();
            log(`Removed non-result section without header: ${sectionClass}`);
          }
        }
      });

      statusMessage.textContent = `Kept ${keptCount} out of ${products.length} products.`;
    } catch (error) {
      log(`Error in filtering: ${error.message}`);
      statusMessage.textContent = "An error occurred during filtering.";
    }
  });

  const logoAndTitle = document.createElement('div');
  logoAndTitle.style.display = "flex";
  logoAndTitle.style.alignItems = "center";
  logoAndTitle.style.marginBottom = "10px";

  const logo = document.createElement('img');
  logo.src = "https://i.imgur.com/d2uMms8.png";
  logo.alt = "AI Filter Logo";
  logo.style.width = "48px";
  logo.style.height = "48px";
  logo.style.marginRight = "10px";

  const title = document.createElement('span');
  title.textContent = "Amazon Shopping Filter";
  title.style.fontWeight = "bold";
  title.style.fontSize = "20px";

  logoAndTitle.appendChild(logo);
  logoAndTitle.appendChild(title);
  filterContainer.appendChild(logoAndTitle);

  filterContainer.appendChild(conditionInput);
  filterContainer.appendChild(addConditionButton);
  filterContainer.appendChild(clearConditionsButton);
  filterContainer.appendChild(conditionsList);
  filterContainer.appendChild(filterButton);

  if (!OPENAI_API_KEY) {
    const apiKeyWarning = document.createElement('div');
    apiKeyWarning.textContent = "Please configure the OpenAI API key in the popup to enable filtering.";
    apiKeyWarning.style.color = "red";
    apiKeyWarning.style.marginTop = "5px";
    apiKeyWarning.style.fontSize = "12px";
    filterContainer.appendChild(apiKeyWarning);
  }

  document.body.appendChild(filterContainer);
}

// Main execution
if (!window.location.pathname.startsWith("/s")) {
  log("Not a search page. Extension will not run.");
} else {
  new Promise((resolve) => {
    chrome.storage.local.get(["openaiApiKey", "extensionEnabled"], (result) => {
      OPENAI_API_KEY = result.openaiApiKey || null;
      EXTENSION_ENABLED = result.extensionEnabled ?? true;
      resolve();
    });
  }).then(() => {
    if (!EXTENSION_ENABLED || !OPENAI_API_KEY) {
      log("Extension is disabled or API key is missing.");
      return;
    }
    log("Extension enabled and API key found. Proceeding...");
    setupUI();
  });
}