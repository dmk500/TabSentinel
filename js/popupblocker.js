// File: popupblocker.js
// Description: Handles popup blocking logic and UI state for the Popup Blocker tab.

const STORAGE_KEYS = {
    ENABLED: "popupBlockerEnabled",
    TOTAL_BLOCKED: "popupBlockedTotal"
};

let popupBlockedThisSession = 0;

document.addEventListener("DOMContentLoaded", initPopupBlockerTab);

function initPopupBlockerTab() {
    const toggle = document.getElementById("popupBlockerToggle");
    const currentCount = document.getElementById("popupBlockedCurrent");
    const totalCount = document.getElementById("popupBlockedTotal");

    // Read state or default to enabled
    chrome.storage.sync.get([STORAGE_KEYS.ENABLED, STORAGE_KEYS.TOTAL_BLOCKED], (data) => {
        const enabled = data[STORAGE_KEYS.ENABLED] !== false;
        toggle.checked = enabled;
        totalCount.textContent = data[STORAGE_KEYS.TOTAL_BLOCKED] || 0;

        if (enabled) {
            startPopupBlocker(currentCount, totalCount);
        }
    });

    // Toggle switch listener
    toggle.addEventListener("change", () => {
        const enabled = toggle.checked;
        chrome.storage.sync.set({[STORAGE_KEYS.ENABLED]: enabled});
        if (enabled) {
            startPopupBlocker(currentCount, totalCount);
        } else {
            stopPopupBlocker();
        }
    });
}

let observer = null;

function startPopupBlocker(currentEl, totalEl) {
    // Observe DOM mutations
    observer = new MutationObserver(() => {
        const blocked = removeSuspiciousPopups();
        if (blocked > 0) {
            popupBlockedThisSession += blocked;
            currentEl.textContent = popupBlockedThisSession;

            // Update total
            chrome.storage.sync.get(STORAGE_KEYS.TOTAL_BLOCKED, (data) => {
                const total = (data[STORAGE_KEYS.TOTAL_BLOCKED] || 0) + blocked;
                chrome.storage.sync.set({[STORAGE_KEYS.TOTAL_BLOCKED]: total});
                totalEl.textContent = total;
            });
        }
    });

    observer.observe(document.body, {childList: true, subtree: true});
}

function stopPopupBlocker() {
    if (observer) {
        observer.disconnect();
        observer = null;
    }
}

// Removes popups matching heuristics and returns how many were removed
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

function isVisible(el) {
    return el.offsetWidth > 0 && el.offsetHeight > 0;
}
