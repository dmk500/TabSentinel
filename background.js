/**
 * TabSentinel Tab Suspender - Chrome Extension
 * -----------------------------------------
 * File: background.js
 * Author: www.llmlounge.com
 * Created: February 2025
 *
 * Description:
 * This background script manages tab suspension, listens for alarms,
 * and handles extension settings. It ensures that inactive tabs are
 * suspended efficiently while respecting user-defined exclusions.
 *
 * License: MIT
 */
import {DEFAULT_CONFIG} from './config.js';

const loggedTabs = new Map(); // tabId -> reason или "suspended"
const suspendedTabs = new Set();
const DEFAULT_EXCLUDED_SITES = DEFAULT_CONFIG.DEFAULT_EXCLUDED_SITES;

function logOnce(tabId, message) {
    if (!loggedTabs.has(tabId)) {
        console.log(message);
        loggedTabs.set(tabId, true);
    }
}


// Create an alarm to periodically check tabs
chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("checkTabs", {periodInMinutes: 0.5});
});

// Allow `popup.js` to request the list of recommended sites
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getRecommendedSites") {
        sendResponse({sites: DEFAULT_EXCLUDED_SITES});
    }
});

// Validate if a URL can be suspended (must be http/https)
function isValidURL(url) {
    try {
        const parsed = new URL(url);
        const invalidPatterns = [".pdf"];
        return ["http:", "https:"].includes(parsed.protocol) &&
            !invalidPatterns.some(pattern => parsed.pathname.endsWith(pattern));
    } catch (e) {
        return false;
    }
}


// Function to check and suspend inactive tabs
function checkTabs() {
    // chrome.storage.sync.get(["suspendTime", "excludedSites"], (data) => {
    chrome.storage.sync.get(["extensionEnabled", "suspendTime", "excludedSites"], (data) => {
        if (data.extensionEnabled === false) {
            logOnce("GLOBAL", "[Skipped: R07] Extension disabled");
            return;
        }
        const SUSPEND_TIME = data.suspendTime || DEFAULT_CONFIG.DEFAULT_SUSPEND_TIME;

        const excludedSites = data.excludedSites || [];

        chrome.tabs.query({windowType: "normal"}, (tabs) => {
            if (!tabs || tabs.length === 0) return; // Exit if no tabs are found

            let now = Date.now();

            chrome.tabs.query({active: true}, (activeTabs) => {
                let activeTabIds = activeTabs.map(tab => tab.id);

                tabs.forEach(tab => {
                    if (!tab.url) return;

                    let parsedUrl;
                    try {
                        parsedUrl = new URL(tab.url);
                    } catch (e) {
                        return; // Некорректный URL — выходим
                    }

                    if (!isValidURL(tab.url)) {
                        console.warn("Skipping unsupported tab:", tab.url);
                        return;
                    }

                    const url = parsedUrl.hostname;
                    // Skip tabs that meet exclusion criteria
                    if (activeTabIds.includes(tab.id)) {
                        return;
                    }

                    if (excludedSites.includes(url)) {
                        console.log("[Skipped: R03] Excluded site —", url);
                        return;
                    }

                    if (suspendedTabs.has(tab.id)) {
                        logOnce(tab.id, `[Skipped: R04] Already suspended — ${tab.title}`);
                        return;
                    }
                    chrome.tabs.get(tab.id, (currentTab) => {
                        if (chrome.runtime.lastError || !currentTab) return; // Ignore erroneous tabs
                        let lastAccessed = currentTab.lastAccessed || now - 10 * 60 * 1000;
                        if (now - lastAccessed > SUSPEND_TIME) {
                            const blockedProtocols = ["chrome:", "chrome-extension:", "about:", "edge:", "file:"];
                            if (blockedProtocols.some(p => tab.url.startsWith(p))) {
                                console.warn("Skipping restricted tab:", tab.url);
                                return;
                            }
                            try {
                                // Test access by injecting a no-op function
                                chrome.scripting.executeScript({
                                    target: {tabId: tab.id},
                                    func: () => true
                                }).then(() => {
                                    logOnce(tab.id, `[Suspended] ${tab.title} (${tab.url})`);
                                    suspendedTabs.add(tab.id); // Mark as Suspended
                                    chrome.scripting.executeScript({
                                        target: {tabId: tab.id},
                                        func: suspendTab,
                                        args: [chrome.runtime.getURL('icon_bg.png')],
                                    }).catch(err => {
                                        console.error("Suspend failed after access granted:", tab.url, err);
                                    });
                                }).catch(err => {
                                    console.warn("Skipping tab (reason 01 - restricted by browser):", tab.url);
                                });


                            } catch (e) {
                                console.error("Sync exception while injecting script:", tab.url, e);
                            }

                        }
                    });
                });
            });
        });
    });
}

// Function to suspend a tab
function suspendTab(iconUrl) {
    if (!document.getElementById("suspend-overlay")) {
        document.body.innerHTML = `
            <div id="suspend-overlay" style="
                position: fixed;
                top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex; align-items: center; justify-content: center;
                flex-direction: column;
                font-family: Arial, sans-serif;
                text-align: center;
                color: white;">
                <img src="${iconUrl}" alt="Tab Sentinel Logo" style="width: 240px; height: auto; margin-bottom: 20px;">
                <p>Click to reactivate</p>
            </div>
        `;


        if (!document.title.includes("💤")) {
            document.title = "💤 " + document.title.replace(/💤/g, "").trim();
        }

        document.getElementById("suspend-overlay").addEventListener("click", () => {
            window.location.reload();
        });
    }
}

// Listen for alarm events to check tabs periodically
chrome.alarms.onAlarm.addListener(() => {
    chrome.storage.sync.get("extensionEnabled", (data) => {
        if (data.extensionEnabled === false) {
            logOnce("GLOBAL_ALARM", "[Skipped: R07] Extension disabled during alarm check");
            return;
        }
        checkTabs();
    });
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "getAllCookies") {
        chrome.cookies.getAll({}, (cookies) => {
            logOnce("COOKIES_POPUP", `[Info] Sending cookies to popup (${cookies.length})`);
            sendResponse(cookies);
        });
        return true; // keep message channel open
    }

});
