<p align="center">
  <img src="assets/logo.png" width="80" alt="AI Filter logo">
</p>

# Amazon AI Shopper

AI-powered filtering for Amazon search results — available as a Chrome extension and a Python script.

**[Install on Chrome Web Store](https://chromewebstore.google.com/detail/amazon-ai-shopper/kgeiakeallceppnaejfhekeeebjfdadc)**

---

## Chrome Extension

The extension injects a widget into Amazon search pages that:

- **Suggests filters** based on your search query and the products on the page
- **Filters results** using plain-English criteria ("hard plastic, for adults", "Nike brand only")
- **Removes noise** sections like Trending, Influencer Picks, and Related Searches
- **Collapses** to a minimal side tab when not in use
- **Auto-resets** filters when you search for something new

Bring your own OpenAI API key — configure it in the extension popup.

### Installing from source

1. Clone this repo
2. Go to `chrome://extensions`, enable Developer Mode
3. Click **Load unpacked** and select the `amazon-filter-extension/` folder
4. Enter your OpenAI API key in the extension popup

---

## Python Script (`main.py`)

Filters a saved Amazon search results HTML file and outputs a cleaned version.

```bash
python3 -m venv .venv
.venv/bin/pip install openai beautifulsoup4 pydantic
.venv/bin/python main.py
```

Edit the variables at the bottom of `main.py` to set the input file and filter criteria.

---

## License

MIT
