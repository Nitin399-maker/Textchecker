# OCR Checker (Textchecker)

> **This is a demo. It contains no confidential data/IP.**

A browser-based tool that extracts text from images using OCR (Optical Character Recognition), then automatically detects spelling errors and decimal formatting issues.

## Features

- **OCR Text Extraction** – Upload images (JPEG, PNG, WebP) and extract text using AI vision models (GPT-4o Mini, Gemini 2.5 Pro/Flash, GPT-4.1, and more).
- **Spell Checking** – AI-powered error detection combined with [Typo.js](https://github.com/cfinke/Typo.js) and a bundled `en_US` dictionary for comprehensive spell checking.
- **Decimal Validator** – Detects decimal comma errors and suggests conversion to proper decimal points.
- **Interactive Review** – Step through detected issues one at a time, accepting or rejecting each suggested correction.
- **PDF Report Generation** – Download an interactive PDF report with clickable comment annotations highlighting all identified issues.
- **Light / Dark / Auto Theme** – Toggle between light, dark, and system-default themes via the navbar.

## Files

| File | Description |
|------|-------------|
| `index.html` | Main application UI (Bootstrap 5, Bootstrap Icons) |
| `script.js` | Core `OCRSpellChecker` class – OCR, spell-check, decimal validation, PDF export |
| `en_US.aff` | Hunspell affix rules for the English (US) dictionary |
| `en_US.dic` | Hunspell word list for the English (US) dictionary |

## Usage

1. Open `index.html` in any modern browser (no build step required).
2. Click **LLM Configuration & Settings** and configure your API key / base URL (OpenAI, OpenRouter, or Anthropic).
3. Upload or drag-and-drop an image.
4. Click **Process** to extract text and run checks.
5. Review detected issues and accept or reject corrections.
6. Download the PDF report if needed.

## Requirements

- A modern browser with ES module support.
- An API key for a supported LLM provider (OpenAI, OpenRouter, or Anthropic).

## Tech Stack

- **Frontend:** HTML5, Bootstrap 5, Bootstrap Icons
- **Spell Checking:** Typo.js with an `en_US` Hunspell dictionary
- **LLM Integration:** `bootstrap-llm-provider` (CDN) supporting OpenAI-compatible APIs
- **PDF Generation:** Client-side, via the LLM provider library