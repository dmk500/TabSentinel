// File: js/suspender.js
import {DEFAULT_CONFIG} from './config.js';

const suspendedTabs = new Set();
const loggedTabs = new Map();

function logOnce(tabId, message) {
    if (!DEFAULT_CONFIG.ENABLE_SLEEP_LOGS) return;
    if (!loggedTabs.has(tabId)) {
        console.log(message);
        loggedTabs.set(tabId, true);
    }
}

function logWarn(...args) {
    if (DEFAULT_CONFIG.ENABLE_SLEEP_LOGS) {
        console.warn(...args);
    }
}


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

export function checkTabs() {
    chrome.storage.sync.get(["extensionEnabled", "suspendTime", "excludedSites"], (data) => {
        if (data.extensionEnabled === false) {
            logOnce("GLOBAL", "[Skipped: R07] Extension disabled");
            return;
        }

        const SUSPEND_TIME = data.suspendTime || DEFAULT_CONFIG.DEFAULT_SUSPEND_TIME;
        const excludedSites = data.excludedSites || [];

        chrome.tabs.query({windowType: "normal"}, (tabs) => {
            if (!tabs || tabs.length === 0) return;
            const now = Date.now();

            chrome.tabs.query({active: true}, (activeTabs) => {
                const activeTabIds = activeTabs.map(tab => tab.id);

                tabs.forEach(tab => {
                    if (!tab.url) return;

                    let parsedUrl;
                    try {
                        parsedUrl = new URL(tab.url);
                    } catch {
                        return;
                    }

                    const hostname = parsedUrl.hostname;
                    if (!isValidURL(tab.url) || activeTabIds.includes(tab.id) || excludedSites.includes(hostname) || suspendedTabs.has(tab.id)) {
                        return;
                    }

                    chrome.tabs.get(tab.id, (currentTab) => {
                        if (chrome.runtime.lastError || !currentTab) return;

                        const lastAccessed = currentTab.lastAccessed || now - 10 * 60 * 1000;
                        if (now - lastAccessed > SUSPEND_TIME) {
                            chrome.scripting.executeScript({
                                target: {tabId: tab.id},
                                func: () => true
                            }).then(() => {
                                logOnce(tab.id, `[Suspended] ${tab.title} (${tab.url})`);
                                suspendedTabs.add(tab.id);

                                chrome.scripting.executeScript({
                                    target: {tabId: tab.id},
                                    func: suspendTab,
                                    args: [chrome.runtime.getURL('../img/icon_bg.png')]
                                });
                            }).catch(err => {
                                logWarn("Skipping tab (R01 - restricted):", tab.url, err);
                            });
                        }
                    });
                });
            });
        });
    });
}

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

export function initSuspenderAlarms() {
    chrome.runtime.onStartup.addListener(() => {
        chrome.alarms.create("checkTabs", {periodInMinutes: 0.5});
    });

    chrome.runtime.onInstalled.addListener(() => {
        chrome.alarms.create("checkTabs", {periodInMinutes: 0.5});
    });
}

export function handleAlarm(alarm) {
    if (alarm.name === "checkTabs") {
        chrome.storage.sync.get("extensionEnabled", (data) => {
            if (data.extensionEnabled === false) {
                logOnce("GLOBAL_ALARM", "[Skipped: R07] Suspender disabled");
                return;
            }
            checkTabs();
        });
    }
}
