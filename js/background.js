// File: js/background.js
// Entry point for TabSentinel background logic.
// Registers global message handlers, alarm triggers, and initializes suspender.

import {initSuspenderAlarms, handleAlarm} from './suspender.js';
import {DEFAULT_CONFIG} from './config.js';

// ✅ Register background message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 📦 Embedded domains for current tab (used by cookie.js)
    if (message.action === "getEmbeddedDomains") {
        const tabId = message.tabId;
        if (!tabId) {
            sendResponse({error: "No tabId provided"});
            return true;
        }

        chrome.scripting.executeScript({
            target: {tabId}, // ✅ используем message.tabId, не sender.tab
            func: () => {
                const domains = new Set();

                ['src', 'href', 'action'].forEach(attr => {
                    document.querySelectorAll(`[${attr}]`).forEach(el => {
                        try {
                            const val = el.getAttribute(attr);
                            const url = new URL(val, document.baseURI);
                            if (url.hostname !== location.hostname) domains.add(url.hostname);
                        } catch (_) {
                        }
                    });
                });

                if (performance.getEntriesByType) {
                    performance.getEntriesByType("resource").forEach(entry => {
                        try {
                            const url = new URL(entry.name);
                            if (url.hostname !== location.hostname) domains.add(url.hostname);
                        } catch (_) {
                        }
                    });
                }

                return Array.from(domains);
            }
        }, (results) => {
            const result = results?.[0]?.result || [];
            sendResponse({embeddedHosts: result});
        });

        return true; // async response
    }

    // Handle request to get all cookies
    if (message.action === "getAllCookies") {
        chrome.cookies.getAll({}, (cookies) => {
            sendResponse(cookies);
        });
        return true;
    }

    // Handle optional recommended sites (TODO: implement if needed)
    if (message.action === "getRecommendedSites") {
        sendResponse({sites: DEFAULT_CONFIG.DEFAULT_EXCLUDED_SITES});
        return true;
    }
    // 🟢 Enable periodic suspension
    if (message.action === "suspend:enable") {
        chrome.alarms.create("checkTabs", {periodInMinutes: 0.5});
        sendResponse({status: "enabled"});
        return true;
    }

    // 🔴 Disable suspension and unfreeze all
    if (message.action === "suspend:disable") {
        chrome.alarms.clear("checkTabs");

        chrome.tabs.query({windowType: "normal"}, (tabs) => {
            tabs.forEach(tab => {
                chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: () => {
                        const overlay = document.getElementById("suspend-overlay");
                        if (overlay) window.location.reload();
                    }
                });
            });
        });

        sendResponse({status: "disabled"});
        return true;
    }

    // 🔒 Freeze all tabs manually
    if (message.action === "freezeAll") {
        chrome.storage.sync.get(["excludedSites"], (data) => {
            const excluded = data.excludedSites || [];
            const iconUrl = chrome.runtime.getURL('../img/icon_bg.png');

            chrome.tabs.query({windowType: "normal"}, (tabs) => {
                tabs.forEach(tab => {
                    if (!tab.url || tab.active) return;

                    let parsed;
                    try {
                        parsed = new URL(tab.url);
                    } catch {
                        return;
                    }

                    const host = parsed.hostname;
                    const protocol = parsed.protocol;

                    if (
                        DEFAULT_CONFIG.DISALLOWED_PROTOCOLS.includes(protocol) ||
                        excluded.includes(host)
                    ) return;

                    chrome.scripting.executeScript({
                        target: {tabId: tab.id},
                        func: (iconUrl) => {
                            if (!document.getElementById("suspend-overlay")) {
                                document.body.innerHTML = `
                                <div id="suspend-overlay" style="
                                    position: fixed;
                                    top: 0; left: 0; width: 100%; height: 100%;
                                    background: rgba(0, 0, 0, 0.5);
                                    display: flex; align-items: center; justify-content: center;
                                    flex-direction: column;
                                    font-family: Arial, sans-serif;
                                    text-align: center;
                                    color: white;">
                                    <img id="ts-logo" alt="Tab Sentinel Logo" style="width: 240px; height: auto; margin-bottom: 20px;">
                                    <p>Click to reactivate</p>
                                </div>
                            `;
                                document.getElementById("ts-logo").src = iconUrl;
                                if (!document.title.includes("💤")) {
                                    document.title = "💤 " + document.title.replace(/💤/g, "").trim();
                                }
                                document.getElementById("suspend-overlay").addEventListener("click", () => {
                                    window.location.reload();
                                });
                            }
                        },
                        args: [iconUrl]
                    });
                });
            });
        });

        sendResponse({status: "frozen"});
        return true;
    }

    // 🔓 Unfreeze all tabs
    if (message.action === "unfreezeAll") {
        chrome.tabs.query({windowType: "normal"}, (tabs) => {
            tabs.forEach(tab => {
                chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: () => {
                        const overlay = document.getElementById("suspend-overlay");
                        if (overlay) window.location.reload();
                    }
                });
            });
        });

        sendResponse({status: "unfrozen"});
        return true;
    }

    // 🌀 Manual trigger for suspender checkTabs()
    if (message.action === "suspend:forceCheck") {
        import('./suspender.js').then(module => {
            module.checkTabs();
            sendResponse({status: "checkTabs() triggered"});
        });
        return true;
    }


    return false;
});

// ✅ Register alarm handler for periodic tab checks
chrome.alarms.onAlarm.addListener((alarm) => {
    handleAlarm(alarm);
});

// ✅ Start alarm scheduling on install/startup
initSuspenderAlarms();


