// Constants
const DEFAULT_FILTER = "hard plastic and for adults";

let OPENAI_API_KEY = null;
let EXTENSION_ENABLED = true;
const _savedQuery = localStorage.getItem('filterQuery') || '';
const _currentQuery = new URLSearchParams(window.location.search).get('k') || '';
let filterConditions = (_currentQuery && _currentQuery !== _savedQuery)
  ? (localStorage.setItem('filterConditions', '[]'), localStorage.setItem('filterQuery', _currentQuery), [])
  : JSON.parse(localStorage.getItem('filterConditions')) || [];
let productLimit = JSON.parse(localStorage.getItem('productLimit')) || Infinity;

function log(message) {
  console.log(`[Amazon Filter Extension]: ${message}`);
}

function getSearchQuery() {
  return new URLSearchParams(window.location.search).get('k') || '';
}

function queryPageProducts() {
  const products = [];
  document.querySelectorAll("div.s-result-item[data-component-type='s-search-result']").forEach((item) => {
    const titleElement = item.querySelector("h2[aria-label]");
    if (titleElement) {
      products.push({ name: titleElement.getAttribute("aria-label").trim(), element: item });
    }
  });
  return products;
}

async function generateSuggestions(productNames, searchQuery, apiKey) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-5.4",
      messages: [{
        role: "user",
        content: `Search query: "${searchQuery}"\n\nProduct titles on page:\n${productNames.join('\n')}\n\nSuggest exactly 4 short filter options (max 4 words each) to help narrow these results. Rules:\n- Do NOT restate anything already in the search query\n- Only suggest a filter if a meaningful portion of results would be excluded by it (i.e. the results are actually divided on that dimension)\n- Prefer non-obvious dimensions: specific brand, subcategory, feature, material, age group, price tier — not generic terms the user already typed\n- Each suggestion should be a useful, standalone filter phrase\nReturn JSON.`,
      }],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "suggestions",
          strict: true,
          schema: {
            type: "object",
            properties: { suggestions: { type: "array", items: { type: "string" } } },
            required: ["suggestions"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`API ${response.status}: ${responseText}`);
  const data = JSON.parse(responseText);
  return JSON.parse(data.choices[0].message.content).suggestions.slice(0, 4);
}

async function fetchRelevantProducts(products, filterCriteria, openaiApiKey) {
  log("Calling OpenAI API...");

  const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
  const productSchema = {
    type: "object",
    properties: { relevant: { type: "array", items: { type: "boolean" } } },
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
    "relevant": [true, false, false, true]
}

Now, analyze the following products:
Products:
${JSON.stringify(limitedProducts.map((p) => p.name), null, 2)}`,
    },
    { role: "user", content: JSON.stringify(limitedProducts.map((p) => p.name)) },
  ];

  try {
    const startTime = performance.now();
    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiApiKey}` },
      body: JSON.stringify({
        model: "gpt-5.4",
        messages,
        response_format: {
          type: "json_schema",
          json_schema: { name: "product_filter", strict: true, schema: productSchema },
        },
      }),
    });

    const responseText = await response.text();
    log(`Raw API response: ${responseText}`);

    if (!response.ok) throw new Error(`API Error: ${response.status} - ${responseText}`);

    const result = JSON.parse(responseText);
    if (!result.choices || !result.choices[0]) throw new Error("Invalid API response: 'choices[0]' is missing.");

    const parsedContent = JSON.parse(result.choices[0].message.content);
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

function setupUI() {
  const products = queryPageProducts();
  log(`Found ${products.length} products on the page.`);

  // --- helpers ---
  function addCondition(text) {
    if (!text || filterConditions.includes(text)) return;
    filterConditions.push(text);
    localStorage.setItem('filterConditions', JSON.stringify(filterConditions));
    localStorage.setItem('filterQuery', getSearchQuery());

    const pill = document.createElement('span');
    pill.style.cssText = "display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#e8f0fe;border:1px solid #aac4f5;border-radius:20px;font-size:13px;color:#1a56c4;";
    pill.appendChild(document.createTextNode(text));

    const removeBtn = document.createElement('button');
    removeBtn.textContent = "×";
    removeBtn.style.cssText = "border:none;background:none;color:#1a56c4;cursor:pointer;font-size:15px;line-height:1;padding:0;margin-left:2px;";
    removeBtn.addEventListener('click', () => {
      filterConditions = filterConditions.filter((c) => c !== text);
      pill.remove();
      localStorage.setItem('filterConditions', JSON.stringify(filterConditions));
    });

    pill.appendChild(removeBtn);
    conditionsList.appendChild(pill);
  }

  // --- container ---
  const filterContainer = document.createElement('div');
  filterContainer.style.cssText = `
    position:fixed; top:70px; right:16px; z-index:9999;
    background:#fff; border:1px solid #ddd;
    border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,0.15);
    width:420px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    font-size:14px; color:#111; overflow:hidden;
  `;

  // --- header bar ---
  const header = document.createElement('div');
  header.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#0073e6;border-radius:12px 12px 0 0;";
  const logo = document.createElement('img');
  logo.src = "https://i.imgur.com/d2uMms8.png";
  logo.alt = "";
  logo.style.cssText = "width:22px;height:22px;margin-right:8px;border-radius:4px;";
  const titleEl = document.createElement('span');
  titleEl.textContent = "AI Filter";
  titleEl.style.cssText = "font-weight:700;font-size:15px;color:#fff;";
  const statusMessage = document.createElement('span');
  statusMessage.style.cssText = "font-size:12px;color:rgba(255,255,255,0.85);margin-left:auto;padding-left:10px;white-space:nowrap;";
  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = '‹';
  toggleBtn.title = "Collapse";
  toggleBtn.style.cssText = "border:none;background:rgba(255,255,255,0.2);color:#fff;border-radius:6px;width:22px;height:22px;font-size:15px;cursor:pointer;margin-left:8px;display:flex;align-items:center;justify-content:center;flex-shrink:0;";

  const headerLeft = document.createElement('div');
  headerLeft.style.cssText = "display:flex;align-items:center;";
  headerLeft.appendChild(logo);
  headerLeft.appendChild(titleEl);
  header.appendChild(headerLeft);
  header.appendChild(statusMessage);
  header.appendChild(toggleBtn);
  filterContainer.appendChild(header);

  // --- body ---
  const body = document.createElement('div');
  body.style.cssText = "padding:12px 14px;display:flex;flex-direction:column;gap:10px;";
  filterContainer.appendChild(body);

  // --- collapsed side tab ---
  const sideTab = document.createElement('button');
  sideTab.title = "Open filter";
  sideTab.style.cssText = `
    position:fixed; top:120px; right:0; z-index:9999;
    background:#0073e6; color:#fff; border:none;
    border-radius:8px 0 0 8px; padding:10px 6px;
    cursor:pointer; font-size:12px; font-weight:700;
    writing-mode:vertical-rl; text-orientation:mixed;
    letter-spacing:1px; box-shadow:-2px 2px 8px rgba(0,0,0,0.2);
    display:none;
  `;
  sideTab.textContent = "AI Filter";
  document.body.appendChild(sideTab);

  const collapsed = localStorage.getItem('filterWidgetCollapsed') === 'true';
  if (collapsed) {
    filterContainer.style.display = 'none';
    sideTab.style.display = 'block';
  }

  toggleBtn.addEventListener('click', () => {
    filterContainer.style.display = 'none';
    sideTab.style.display = 'block';
    localStorage.setItem('filterWidgetCollapsed', 'true');
  });
  sideTab.addEventListener('click', () => {
    filterContainer.style.display = 'block';
    sideTab.style.display = 'none';
    localStorage.setItem('filterWidgetCollapsed', 'false');
  });

  // --- suggested filters row ---
  const suggestionsRow = document.createElement('div');
  suggestionsRow.style.cssText = "display:flex;align-items:center;gap:6px;flex-wrap:wrap;";
  const suggestionsLabel = document.createElement('span');
  suggestionsLabel.textContent = "Suggest:";
  suggestionsLabel.style.cssText = "font-size:12px;color:#888;white-space:nowrap;";
  const chipsContainer = document.createElement('div');
  chipsContainer.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;flex:1;";
  const loadingChip = document.createElement('span');
  loadingChip.textContent = "Loading…";
  loadingChip.style.cssText = "font-size:12px;color:#bbb;";
  chipsContainer.appendChild(loadingChip);
  suggestionsRow.appendChild(suggestionsLabel);
  suggestionsRow.appendChild(chipsContainer);
  body.appendChild(suggestionsRow);

  // --- active conditions as pills ---
  const conditionsList = document.createElement('div');
  conditionsList.style.cssText = "display:flex;flex-wrap:wrap;gap:5px;min-height:0;";
  body.appendChild(conditionsList);

  // --- input + add row ---
  const inputRow = document.createElement('div');
  inputRow.style.cssText = "display:flex;gap:6px;";
  const conditionInput = document.createElement('input');
  conditionInput.type = "text";
  conditionInput.placeholder = "Type a filter…";
  conditionInput.style.cssText = "flex:1;padding:7px 10px;border:1px solid #ccc;border-radius:8px;font-size:14px;outline:none;";
  const addConditionButton = document.createElement('button');
  addConditionButton.textContent = "Add";
  addConditionButton.style.cssText = "padding:7px 14px;border:1px solid #ccc;border-radius:8px;font-size:14px;cursor:pointer;background:#f5f5f5;white-space:nowrap;";
  inputRow.appendChild(conditionInput);
  inputRow.appendChild(addConditionButton);
  body.appendChild(inputRow);

  // --- action row ---
  const actionRow = document.createElement('div');
  actionRow.style.cssText = "display:flex;gap:6px;";
  const clearConditionsButton = document.createElement('button');
  clearConditionsButton.textContent = "Clear all";
  clearConditionsButton.style.cssText = "padding:8px 14px;border:1px solid #ccc;border-radius:8px;font-size:14px;cursor:pointer;background:#f5f5f5;";
  const filterButton = document.createElement('button');
  filterButton.textContent = "Apply Filter";
  filterButton.style.cssText = `flex:1;padding:8px;border:none;border-radius:8px;font-size:14px;font-weight:700;color:#fff;cursor:${OPENAI_API_KEY ? "pointer" : "not-allowed"};background:${OPENAI_API_KEY ? "#0073e6" : "#ccc"};`;
  filterButton.disabled = !OPENAI_API_KEY;
  actionRow.appendChild(clearConditionsButton);
  actionRow.appendChild(filterButton);
  body.appendChild(actionRow);

  if (!OPENAI_API_KEY) {
    const warn = document.createElement('div');
    warn.textContent = "Configure your OpenAI API key in the popup.";
    warn.style.cssText = "color:#c00;font-size:13px;";
    body.appendChild(warn);
  }

  document.body.appendChild(filterContainer);

  // --- load previous conditions ---
  // Copy saved list, reset array to empty so addCondition can properly repopulate both UI and array
  const savedConditions = [...filterConditions];
  filterConditions = [];
  savedConditions.forEach((c) => addCondition(c));

  // --- event listeners ---
  addConditionButton.addEventListener('click', () => {
    const val = conditionInput.value.trim();
    if (val) { addCondition(val); conditionInput.value = ""; }
  });

  conditionInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const val = conditionInput.value.trim(); if (val) { addCondition(val); conditionInput.value = ""; } }
  });

  clearConditionsButton.addEventListener('click', () => {
    filterConditions = [];
    conditionsList.innerHTML = "";
    statusMessage.textContent = "";
    localStorage.setItem('filterConditions', JSON.stringify(filterConditions));
  });

  filterButton.addEventListener('click', async () => {
    log("Filter button clicked. Applying AI filter...");
    const combinedFilter = filterConditions.join(" and ") || DEFAULT_FILTER;
    log(`Using filter criteria: ${combinedFilter}`);
    statusMessage.textContent = "Filtering…";

    const currentProducts = queryPageProducts();
    log(`Found ${currentProducts.length} products on the page.`);

    try {
      const relevantProducts = await fetchRelevantProducts(currentProducts, combinedFilter, OPENAI_API_KEY);
      log(`Filtering complete. ${relevantProducts.length} relevant products identified.`);

      let keptCount = 0;
      currentProducts.forEach((product) => {
        if (relevantProducts.includes(product)) {
          keptCount++;
        } else {
          product.element.style.setProperty("display", "none", "important");
        }
      });

      // Hide carousels and noise sections
      document.querySelectorAll("[data-component-type='s-searchgrid-carousel']").forEach(el => {
        el.style.setProperty("display", "none", "important");
      });

      const NOISE_PATTERNS = ["trending", "influencer", "related search", "customers also", "recently bought", "seen on social", "recommended based on", "browsing history"];
      document.querySelectorAll("h2, h3").forEach(heading => {
        const text = heading.textContent.trim().toLowerCase();
        if (NOISE_PATTERNS.some(p => text.includes(p))) {
          const section = heading.closest("[data-component-type]") || heading.closest(".s-result-item") || heading.parentElement?.parentElement?.parentElement;
          if (section && !section.querySelector("[data-component-type='s-search-result']")) {
            section.style.setProperty("display", "none", "important");
            log(`Removed noise section: ${text}`);
          }
        }
      });

      statusMessage.textContent = `${keptCount} / ${currentProducts.length} kept`;
    } catch (error) {
      log(`Error in filtering: ${error.message}`);
      statusMessage.textContent = "Error — check console";
    }
  });

  // --- async: load suggested filter chips ---
  if (OPENAI_API_KEY && products.length > 0) {
    const searchQuery = getSearchQuery();
    const productNames = products.map(p => p.name);
    generateSuggestions(productNames, searchQuery, OPENAI_API_KEY)
      .then((suggestions) => {
        chipsContainer.innerHTML = "";
        suggestions.forEach((suggestion) => {
          const chip = document.createElement('button');
          chip.textContent = suggestion;
          chip.style.cssText = `
            font-size:11px;padding:3px 7px;border-radius:12px;
            border:1px solid #0073e6;background:white;color:#0073e6;
            cursor:pointer;white-space:nowrap;
          `;
          chip.addEventListener('click', () => {
            addCondition(suggestion);
            chip.style.background = "#0073e6";
            chip.style.color = "white";
            chip.disabled = true;
          });
          chipsContainer.appendChild(chip);
        });
      })
      .catch((err) => {
        log(`Suggestions error: ${err.message}`);
        chipsContainer.innerHTML = "";
        loadingChip.textContent = "Could not load suggestions.";
        chipsContainer.appendChild(loadingChip);
      });
  } else {
    chipsContainer.innerHTML = "";
  }
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
