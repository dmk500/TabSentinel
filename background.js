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

const suspendedTabs = new Set();
import {DEFAULT_CONFIG} from './config.js';

const DEFAULT_EXCLUDED_SITES = DEFAULT_CONFIG.DEFAULT_EXCLUDED_SITES;


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

// Function to check and suspend inactive tabs
function checkTabs() {
    // chrome.storage.sync.get(["suspendTime", "excludedSites"], (data) => {
    chrome.storage.sync.get(["extensionEnabled", "suspendTime", "excludedSites"], (data) => {
        if (data.extensionEnabled === false) {
            console.log("Extension is disabled. Skipping checkTabs.");
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

                    const protocol = parsedUrl.protocol;
                    const hostname = parsedUrl.hostname;

                    if (
                        DEFAULT_CONFIG.DISALLOWED_PROTOCOLS.includes(protocol) ||
                        !hostname
                    ) {
                        console.warn("Skipping unsupported tab:", tab.url);
                        return;
                    }


                    const url = parsedUrl.hostname;


                    // Skip tabs that meet exclusion criteria
                    if (activeTabIds.includes(tab.id) || excludedSites.includes(url) || suspendedTabs.has(tab.id) || !isValidURL(tab.url)) {
                        return;
                    }

                    chrome.tabs.get(tab.id, (currentTab) => {
                        if (chrome.runtime.lastError || !currentTab) return; // Ignore erroneous tabs

                        let lastAccessed = currentTab.lastAccessed || now - 10 * 60 * 1000;

                        if (now - lastAccessed > SUSPEND_TIME) {
                            console.log("Suspending tab:", tab.id, tab.title);
                            chrome.scripting.executeScript({
                                target: {tabId: tab.id},
                                func: suspendTab,
                                args: [chrome.runtime.getURL('icon_bg.png')],

                            }).catch(err => console.error("Error suspending tab:", err));
                        }
                    });
                });
            });
        });
    });
}

// Validate if a URL can be suspended
function isValidURL(url) {
    return url && !url.startsWith("chrome://") && !url.startsWith("file://") &&
        !url.startsWith("edge://") && !url.startsWith("chrome-extension://") &&
        !url.startsWith("about:");
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
            console.log("Extension is disabled. Skipping alarm check.");
            return;
        }
        checkTabs();
    });
});
