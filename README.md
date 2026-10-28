# Claude Chrome Extension

[English](/README.md) | [日本語](/README.ja.md)

A Chrome extension that lets you ask Claude about the page you're viewing or text you've selected, then summarize or translate it, all from the browser side panel.

## Features

- **Side panel chat**: use it while you browse. The conversation stays after you close the panel, until the browser closes.
- **Multi-turn conversation**: follow-up questions build on earlier answers.
- **One-click actions**: summarize, translate, explain, proofread, draft a reply.
- **Context menu**: send selected text or the whole page to Claude with a right-click.
- **Whole-page reading**: attach the page body without selecting anything.
- **Rich rendering**: headings, lists, tables, and code blocks with copy buttons.
- **Streaming with a stop button**, plus regenerate and copy.
- **Model choice**: Claude Opus 5.5, Sonnet 5.5, or Haiku 5.5.
- **Light and dark mode**.
- Keyboard shortcut (default: `Alt+Shift+C`).

## Installation

1. Clone this repository:
```bash
git clone https://github.com/ywsrock/claude-chrome-extension.git
```
2. Open `chrome://extensions/` in Chrome.
3. Turn on "Developer mode" in the top right.
4. Click "Load unpacked" and select the `src` directory.

Requires Chrome 116 or later.

## Setup

1. Click ⚙️ in the side panel, or right-click the extension icon and choose "Options".
2. Enter an API key from the [Claude Console](https://console.anthropic.com/settings/keys) and click "接続テスト" (Test connection).
3. Optionally choose the model, effort, response language, and custom instructions, then save.

## Usage

- Click the **toolbar icon** (or press `Alt+Shift+C`) to open the side panel and ask a question.
- Use **✂️ 選択範囲** (selection) or **📄 ページ** (page) to attach content before asking.
- **Quick action buttons** (summarize, translate, and so on) act on the attached content. With nothing attached, they use the current selection, or the whole page if nothing is selected.
- Paste text into the input box and press a quick action to run it on that text.
- **Right-click** on a page and pick an action under "Claude AI Assistant".
- `Enter` sends, `Shift+Enter` adds a new line. Confirming IME input doesn't send.

## Project structure

```
src/
├── manifest.json     # Extension manifest
├── background.js     # Context menus and side panel control
├── sidepanel.html    # Side panel UI
├── sidepanel.css     # Styles for the side panel and options page
├── sidepanel.js      # Conversation, page reading, rendering
├── options.html      # Options page UI
├── options.js        # Options page logic
└── lib/
    ├── api.js        # Claude API client (streaming)
    ├── markdown.js   # Safe Markdown rendering of responses
    ├── page.js       # Reading text from tabs
    └── settings.js   # Settings, models, quick actions, prompts
```

## Permissions

| Permission | Purpose |
|---|---|
| `activeTab`, `scripting` | Read the selection or page text of the tab you invoked the extension on |
| `sidePanel` | Show the side panel |
| `contextMenus` | Right-click menu |
| `storage` | Store the API key, settings, and conversation |
| `https://api.anthropic.com/*` | Send requests to the Claude API |
| All sites (optional) | Requested only when you read a page after switching tabs without clicking the icon |

## Security notes

- The API key is stored only in this browser (`chrome.storage.local`) and isn't synced to your Google account. Keys stored in synced storage by v1 are migrated and removed on update.
- Attached page content is sent to the Anthropic API. Take care on pages with sensitive information.
- For long pages, only the first 100,000 characters are sent, and the panel shows when this happens.
- Some pages, such as `chrome://` pages and the Chrome Web Store, can't be read by extensions.

## Author

ywsrock

## Contact

- Email: ywsrock@gmail.com
