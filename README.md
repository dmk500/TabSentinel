# TabSentinel - Chrome Extension

**TabSentinel is a Chrome extension that automatically suspends inactive tabs to help reduce memory usage and improve browser performance.**

![TabSentinel Banner](https://www.llmlounge.com/tabsentinel/tabsentinel.jpg)

## Overview

TabSentinel is a lightweight and user-friendly extension designed to automatically suspend inactive tabs after a specified period. This helps improve system performance and resource efficiency while giving users full control over tab behavior.

### Key Features

- Customizable suspend timeout (default 60 minutes)
- Exclusion list for websites that should never be suspended
- "Freeze All / Unfreeze All" actions from the popup interface
- Global on/off toggle with automatic unfreezing
- Transparent overlay with reactivation click
- Configuration stored in persistent Chrome storage
- Clean and responsive user interface

---

## Installation

### From Chrome Web Store

[Install TabSentinel from the Chrome Web Store](https://chromewebstore.google.com/detail/flhkincklolocahijdbecbmlkdnjpmhc?utm_source=item-share-cb)

### Manual Installation (Developer Mode)

1. Download the source code.
2. Open `chrome://extensions/` in Google Chrome.
3. Enable **Developer Mode** using the toggle at the top right.
4. Click **Load Unpacked** and select the folder with the source code.
5. The extension will appear in your toolbar.

---

## Changelog

### Version 1.6

- Added global on/off toggle in popup
- Disabled all UI controls when extension is off
- Automatically unfreezes all suspended tabs when disabled
- Tooltip added to clarify toggle function
- Minor UI improvements and cleanup

### Version 1.5

- Added "Freeze All" and "Unfreeze All" actions
- Improved suspension overlay and visuals

### Version 1.4

- Moved configuration settings to `config.js`
- Fixed issues with suspend time not applying correctly

### Version 1.3

- Introduced tab suspension indicator
- Optimized UI layout and Chrome storage interactions
- Bug fixes for timing logic

---

## License

This extension is licensed under the **Creative Commons BY-NC 4.0** license.  
**Free for personal use only. Commercial use is not permitted.**

More information: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)

---

## Support

For questions, issues, or feature requests, please contact: [support@llmlounge.com](mailto:support@llmlounge.com)
"""

---

## Resources & Links

- 🛒 **Chrome Web Store**:  
  [TabSentinel on Chrome Web Store](https://chromewebstore.google.com/detail/tabsentinel-tab-suspender/flhkincklolocahijdbecbmlkdnjpmhc)

- 🔐 **Privacy Policy**:  
  [https://www.llmlounge.com/privacy.html](https://www.llmlounge.com/privacy.html)

- 📄 **About TabSentinel** (in extension UI):  
  Open the extension popup and click **ℹ️ About**

- 💻 **Source Code**:  
  You're here! This repository contains the full open-source code.

---

## 🔐 Privacy Statement

TabSentinel does **not collect**, **store**, or **transmit** any personal information.  
All settings are stored **locally** in your browser using Chrome's `storage.sync` API.  
There are **no tracking scripts**, no analytics, and no third-party integrations.

---

## 🛠 Built With

- Manifest V3
- Chrome Extension APIs
- JavaScript (ES6 modules)
- HTML / CSS (popup UI)

---
## Error and Notification list
| Code | Cause When used                                                           |
| -----|---------------------------------------------------------------------------|
| R01 | restricted by browser Chrome does not allow inserting a script into this tab |
| R02 | unsupported protocol The tab uses chrome:, file:, etc.                    |
| R03 | excluded site The domain is on the exclusion list                         |
| R04 | already suspended Tab has already been suspended                          |
| R05 | active tab Tab is active, does not need to be suspended.                  |
| R06 | invalid or unknown URL Incorrect or unrecognized URL                      |
| R07 | extension disabled User disabled extension                                |
| -----|---------------------------------------------------------------------------|