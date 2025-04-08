/**
 * TabSentinel Tab Suspender - Chrome Extension
 * -----------------------------------------
 * File: popup.js
 * Author: www.llmlounge.com
 * Created: February 2025
 *
 * Description:
 * This script handles the popup UI interactions, allowing users to
 * configure suspend time, manage excluded sites, and view extension
 * information. Changes are automatically saved and synced via Chrome Storage.
 *
 * License: MIT
 */
import {DEFAULT_CONFIG} from './config.js';

document.addEventListener("DOMContentLoaded", () => {
    const suspendTimeInput = document.getElementById("suspendTime");
    const addCurrentTabButton = document.getElementById("addCurrentTab");
    const clearExclusionsButton = document.getElementById("clearExclusions");
    const loadRecommendedButton = document.getElementById("loadRecommended");
    const excludedList = document.getElementById("excludedList");
    const aboutButton = document.getElementById("aboutBtn");
    const aboutModal = document.getElementById("aboutModal");
    const closePopup = document.getElementById("closePopup");
    const errorMessage = document.getElementById("errorMessage");
    const freezeAllTabsButton = document.getElementById("freezeAllTabs");
    const unfreezeAllTabsButton = document.getElementById("unfreezeAllTabs");

    suspendTimeInput.min = DEFAULT_CONFIG.MIN_SUSPEND_TIME_MINUTES;
    suspendTimeInput.max = DEFAULT_CONFIG.MAX_SUSPEND_TIME_MINUTES;

    let saveTimeout;

    function saveExcludedSites(excludedSites) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            chrome.storage.sync.set({excludedSites}, () => {
                updateExclusionList(excludedSites);
            });
        }, 500);
    }

    function updateExclusionList(excludedSites) {
        excludedSites.sort();
        excludedList.innerHTML = "";
        excludedSites.forEach(site => {
            let li = document.createElement("li");
            li.textContent = site;
            let removeButton = document.createElement("button");
            removeButton.textContent = "❌";
            removeButton.addEventListener("click", () => {
                let newList = excludedSites.filter(s => s !== site);
                saveExcludedSites(newList);
            });
            li.appendChild(removeButton);
            excludedList.appendChild(li);
        });
    }

    chrome.storage.sync.get(["suspendTime", "excludedSites"], (data) => {
        const suspendMs = data.suspendTime ?? DEFAULT_CONFIG.DEFAULT_SUSPEND_TIME;
        suspendTimeInput.value = suspendMs / 60000;

        let excludedSites = data.excludedSites;
        if (!Array.isArray(excludedSites) || excludedSites.length === 0) {
            excludedSites = [...DEFAULT_CONFIG.DEFAULT_EXCLUDED_SITES];
            chrome.storage.sync.set({excludedSites});
        }

        updateExclusionList(excludedSites);
    });

    suspendTimeInput.addEventListener("input", () => {
        let value = parseInt(suspendTimeInput.value);
        if (
            isNaN(value) ||
            value < DEFAULT_CONFIG.MIN_SUSPEND_TIME_MINUTES ||
            value > DEFAULT_CONFIG.MAX_SUSPEND_TIME_MINUTES
        ) {
            value = DEFAULT_CONFIG.DEFAULT_SUSPEND_TIME / 60000;
        }
        chrome.storage.sync.set({suspendTime: value * 60000}, () => {
            console.log("Auto-saved suspend time:", value, "minutes");
        });
    });

    addCurrentTabButton.addEventListener("click", () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs.length === 0 || !tabs[0].url) return;
            let url = new URL(tabs[0].url).hostname;

            chrome.storage.sync.get(["excludedSites"], (data) => {
                let excludedSites = data.excludedSites || [];
                if (!excludedSites.includes(url)) {
                    excludedSites.push(url);
                    saveExcludedSites(excludedSites);
                }
            });
        });
    });

    clearExclusionsButton.addEventListener("click", () => {
        chrome.storage.sync.set({excludedSites: []}, () => {
            updateExclusionList([]);
        });
    });

    loadRecommendedButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({action: "getRecommendedSites"}, (response) => {
            if (!response || !response.sites) {
                errorMessage.textContent = "Error loading recommended sites.";
                return;
            }

            chrome.storage.sync.get(["excludedSites"], (data) => {
                let excludedSites = data.excludedSites || [];
                response.sites.forEach(site => {
                    if (!excludedSites.includes(site)) {
                        excludedSites.push(site);
                    }
                });

                saveExcludedSites(excludedSites);
            });
        });
    });

    aboutButton.addEventListener("click", () => {
        aboutModal.style.display = "block";
    });

    closePopup.addEventListener("click", () => {
        aboutModal.style.display = "none";
    });

    window.addEventListener("click", (event) => {
        if (event.target === aboutModal) {
            aboutModal.style.display = "none";
        }
    });

    freezeAllTabsButton.addEventListener("click", () => {
        chrome.storage.sync.get(["excludedSites"], (data) => {
            const excludedSites = data.excludedSites || [];
            const iconUrl = chrome.runtime.getURL('icon_bg.png');

            chrome.tabs.query({windowType: "normal"}, (tabs) => {
                tabs.forEach(tab => {
                    if (!tab || !tab.id || !tab.url) return;

                    let url;
                    try {
                        url = new URL(tab.url).hostname;
                    } catch (e) {
                        return;
                    }

                    if (tab.active || excludedSites.includes(url)) return;

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
    });

    unfreezeAllTabsButton.addEventListener("click", () => {
        chrome.tabs.query({windowType: "normal"}, (tabs) => {
            tabs.forEach(tab => {
                chrome.scripting.executeScript({
                    target: {tabId: tab.id},
                    func: () => {
                        const overlay = document.getElementById("suspend-overlay");
                        if (overlay) {
                            window.location.reload();
                        }
                    }
                });
            });
        });
    });
});