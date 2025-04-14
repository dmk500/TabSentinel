// File: content-popupblocker.js
// Description: Automatically blocks popup/cookie modals on page load

const SELECTORS = [
    "[id*='cookie']",
    "[class*='cookie']",
    "[id*='consent']",
    "[class*='consent']",
    "[id*='popup']",
    "[class*='popup']",
    "[id*='overlay']",
    "[class*='overlay']",
    "[role='dialog']"
];

let observer = null;
let popupBlocked = 0;

chrome.storage.sync.get(["popupBlockerEnabled"], (data) => {
    const enabled = data.popupBlockerEnabled !== false;
    if (enabled) {
        observeAndBlock();
    }
});

function observeAndBlock() {
    observer = new MutationObserver(() => {
        popupBlocked += removeSuspiciousPopups();
        if (popupBlocked > 0) {
            chrome.runtime.sendMessage({
                action: "popupBlocked",
                count: popupBlocked
            });
        }
    });

    observer.observe(document.body, {childList: true, subtree: true});
}

function removeSuspiciousPopups() {
    let count = 0;
    document.querySelectorAll(SELECTORS.join(",")).forEach(el => {
        if (el.offsetWidth > 0 && el.offsetHeight > 0) {
            el.remove();
            count++;
        }
    });
    return count;
}
