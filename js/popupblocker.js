// File: js/popupblocker.js
// Description: Handles the Popup Blocker tab logic inside the popup.html

const STORAGE_KEYS = {
    ENABLED: "popupBlockerEnabled",
    TOTAL_BLOCKED: "popupBlockedTotal"
};

let popupBlockedThisSession = 0;

document.addEventListener("DOMContentLoaded", initPopupBlockerTab);

/**
 * Initializes the Popup Blocker tab: loads saved toggle state and blocked stats
 */
function initPopupBlockerTab() {
    const toggle = document.getElementById("popupBlockerToggle");
    const currentCount = document.getElementById("popupBlockedCurrent");
    const totalCount = document.getElementById("popupBlockedTotal");

    // Load stored state or fallback to enabled=true
    chrome.storage.sync.get([STORAGE_KEYS.ENABLED, STORAGE_KEYS.TOTAL_BLOCKED], (data) => {
        const enabled = data[STORAGE_KEYS.ENABLED] !== false;
        toggle.checked = enabled;
        totalCount.textContent = data[STORAGE_KEYS.TOTAL_BLOCKED] || 0;

        if (enabled) {
            startPopupBlocker(currentCount, totalCount);
        }
    });

    // Toggle listener to enable/disable popup blocking
    toggle.addEventListener("change", () => {
        const enabled = toggle.checked;
        chrome.storage.sync.set({ [STORAGE_KEYS.ENABLED]: enabled });
        if (enabled) {
            startPopupBlocker(currentCount, totalCount);
        } else {
            stopPopupBlocker();
        }
    });
}

let observer = null;

/**
 * Starts DOM MutationObserver to detect and remove popups inside the popup UI
 */
function startPopupBlocker(currentEl, totalEl) {
    observer = new MutationObserver(() => {
        const blocked = removeSuspiciousPopups();
        if (blocked > 0) {
            popupBlockedThisSession += blocked;
            currentEl.textContent = popupBlockedThisSession;

            // Update total in chrome.storage
            chrome.storage.sync.get(STORAGE_KEYS.TOTAL_BLOCKED, (data) => {
                const total = (data[STORAGE_KEYS.TOTAL_BLOCKED] || 0) + blocked;
                chrome.storage.sync.set({ [STORAGE_KEYS.TOTAL_BLOCKED]: total });
                totalEl.textContent = total;
            });
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Stops the MutationObserver
 */
function stopPopupBlocker() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

/**
 * Removes common popup banners (cookie notices, overlays, consent modals)
 * @returns {number} - number of elements removed
 */
function removeSuspiciousPopups() {
    const selectors = [
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

    let count = 0;
    document.querySelectorAll(selectors.join(",")).forEach(el => {
        if (isVisible(el)) {
            el.remove();
            count++;
        }
    });
    return count;
}

/**
 * Checks if an element is visible in the DOM
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function isVisible(el) {
    return el.offsetWidth > 0 && el.offsetHeight > 0;
}
