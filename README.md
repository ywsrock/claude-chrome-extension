# Claude Chrome Extension
[English](/README.md) | [日本語](/README.ja.md)

A Chrome extension for interacting with the Claude AI assistant. This extension allows you to select text on any webpage and send it to Claude for analysis and response.

## Features

- Send selected text or direct input to Claude API
- Real-time streaming responses
- Customizable system prompts
- Supports Japanese and English
- Adjustable temperature for response creativity
- Copy responses to clipboard
- Easy settings management

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/claude-chrome-extension.git
```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" in the top right

4. Click "Load unpacked" and select the `src` directory from the cloned repository

## Setup

1. Click the extension settings icon (⚙️) or right-click the extension icon and select "Options"
2. Enter your Claude API key
3. Configure default settings as needed

## Usage

1. Select text on any webpage or enter text directly in the extension popup
2. (Optional) Enter a custom prompt
3. Adjust temperature and language settings if needed
4. Click "Send" to get Claude's response
5. Use the copy button to copy the response to clipboard

## Development

### Project Structure
```
src/
├── popup.html      # Extension popup UI
├── popup.js        # Popup functionality
├── options.html    # Settings page UI
├── options.js      # Settings functionality
└── manifest.json   # Extension configuration
```

### Building and Testing

1. Make changes in the `src` directory
2. Test locally using Chrome's "Load unpacked" feature
3. Test the extension on various websites

## Security Notes

- Always input API keys through the extension settings, never include them in the source code
- Some pages may restrict text selection or API requests
- Clipboard functionality may be limited by browser settings

## Contributing

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Create a Pull Request


## Author

ywsrock

## Contact

- Email: ywsrock@gmail.com
