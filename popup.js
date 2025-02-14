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

document.addEventListener("DOMContentLoaded", () => {
    const suspendTimeInput = document.getElementById("suspendTime");
    const saveSuspendTimeButton = document.getElementById("saveSuspendTime");
    const addCurrentTabButton = document.getElementById("addCurrentTab");
    const clearExclusionsButton = document.getElementById("clearExclusions");
    const loadRecommendedButton = document.getElementById("loadRecommended");
    const excludedList = document.getElementById("excludedList");
    const aboutButton = document.getElementById("aboutBtn");
    const aboutModal = document.getElementById("aboutModal");
    const closePopup = document.getElementById("closePopup");
    const errorMessage = document.getElementById("errorMessage");

    let saveTimeout;

    /**
     * Saves the exclusion list with a debounce effect
     * @param {Array} excludedSites - List of excluded sites
     */
    function saveExcludedSites(excludedSites) {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            chrome.storage.sync.set({ excludedSites }, () => {
                updateExclusionList(excludedSites);
            });
        }, 500);
    }

    /**
     * Updates the exclusion list UI
     * @param {Array} excludedSites - List of excluded sites
     */
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

    /**
     * Loads saved settings
     */
    chrome.storage.sync.get(["suspendTime", "excludedSites"], (data) => {
        if (data.suspendTime) {
            suspendTimeInput.value = data.suspendTime / 60000;
        }
        if (data.excludedSites) {
            updateExclusionList(data.excludedSites);
        } else {
            errorMessage.textContent = "Error loading exclusion list.";
        }
    });

    /**
     * Saves the suspend time value
     */
    saveSuspendTimeButton.addEventListener("click", () => {
        const newTime = parseInt(suspendTimeInput.value) * 60000;
        if (!isNaN(newTime) && newTime > 0) {
            chrome.storage.sync.set({ suspendTime: newTime }, () => {
                console.log("Suspend time saved:", newTime);
            });
        }
    });

    /**
     * Adds the current active tab to the exclusion list
     */
    addCurrentTabButton.addEventListener("click", () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs.length === 0 || !tabs[0].url) {
                return;
            }
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

    /**
     * Clears the exclusion list
     */
    clearExclusionsButton.addEventListener("click", () => {
        chrome.storage.sync.set({ excludedSites: [] }, () => {
            updateExclusionList([]);
        });
    });

    /**
     * Loads recommended sites into the exclusion list
     */
    loadRecommendedButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({ action: "getRecommendedSites" }, (response) => {
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

    /**
     * Opens the "About" modal
     */
    aboutButton.addEventListener("click", () => {
        aboutModal.style.display = "block";
    });

    /**
     * Closes the "About" modal
     */
    closePopup.addEventListener("click", () => {
        aboutModal.style.display = "none";
    });

    /**
     * Closes the modal when clicking outside of it
     */
    window.addEventListener("click", (event) => {
        if (event.target === aboutModal) {
            aboutModal.style.display = "none";
        }
    });
});
