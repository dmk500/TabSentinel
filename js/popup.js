// File: js/popup.js
// Description: Controls the popup interface, tab switching, toggle UI and sends config updates to background

import {DEFAULT_CONFIG} from './config.js';


document.addEventListener("DOMContentLoaded", () => {
    // ✅ Initialize all Bootstrap tab instances
    const bootstrap = window.bootstrap;
    const triggerTabList = document.querySelectorAll('#nav-tab a');
    triggerTabList.forEach(triggerEl => {
        bootstrap.Tab.getOrCreateInstance(triggerEl);
    });


    // ✅ Handle header title changes per tab
    // const labelSpan = document.getElementById("currentTabLabel");
    // const tabMap = {
    //     "nav-home": "🏠 Home",
    //     "nav-suspender": "🛏️ Tab Suspender",
    //     "nav-cookie": "🍪 Cookie Manager",
    //     "nav-popupblocker": "🛑 Popup Blocker",
    //     "nav-about": "ℹ️ About"
    // };
    // const setTabLabel = (id) => {
    //     const shortId = id.replace("-tab", "");
    //     labelSpan.textContent = tabMap[shortId] || "";
    // };
    // const activeTab = document.querySelector(".nav-link.active")?.id;
    // if (activeTab) setTabLabel(activeTab);
    // document.querySelectorAll(".nav-link").forEach(link => {
    //     link.addEventListener("shown.bs.tab", e => setTabLabel(e.target.id));
    // });

    // ✅ Suspender: Inputs & buttons
    const suspendTimeInput = document.getElementById("suspendTime");
    const extensionToggle = document.getElementById("extensionToggle");
    const addCurrentTabButton = document.getElementById("addCurrentTab");
    const clearExclusionsButton = document.getElementById("clearExclusions");
    const loadRecommendedButton = document.getElementById("loadRecommended");
    const freezeAllTabsButton = document.getElementById("freezeAllTabs");
    const unfreezeAllTabsButton = document.getElementById("unfreezeAllTabs");
    const excludedList = document.getElementById("excludedList");
    const controlsContainer = document.getElementById("controlsContainer");
    const errorMessage = document.getElementById("errorMessage");

    // ✅ Set min/max limits from config
    suspendTimeInput.min = DEFAULT_CONFIG.MIN_SUSPEND_TIME_MINUTES;
    suspendTimeInput.max = DEFAULT_CONFIG.MAX_SUSPEND_TIME_MINUTES;

    // ✅ Load extension state + suspend config
    chrome.storage.sync.get(["extensionEnabled", "suspendTime", "excludedSites"], (data) => {
        const enabled = data.extensionEnabled !== false;
        extensionToggle.checked = enabled;
        const suspenderStatusValue = document.getElementById("suspenderStatusValue");
        if (suspenderStatusValue) {
            suspenderStatusValue.textContent = enabled ? "Enabled ✅" : "Disabled ⛔";
            suspenderStatusValue.classList.toggle("text-success", enabled);
            suspenderStatusValue.classList.toggle("text-danger", !enabled);
        }

        updateControlsState(enabled);

        let suspendMs = data.suspendTime ?? DEFAULT_CONFIG.DEFAULT_SUSPEND_TIME;
        if (typeof suspendMs !== "number") {
            suspendMs = DEFAULT_CONFIG.DEFAULT_SUSPEND_TIME;
            chrome.storage.sync.set({suspendTime: suspendMs});
        }

        let excludedSites = data.excludedSites ?? DEFAULT_CONFIG.DEFAULT_EXCLUDED_SITES;
        if (!Array.isArray(excludedSites)) {
            excludedSites = [...DEFAULT_CONFIG.DEFAULT_EXCLUDED_SITES];
            chrome.storage.sync.set({excludedSites});
        }

        suspendTimeInput.value = suspendMs / 60000;
        updateExclusionList(excludedSites);
    });

    // ✅ Toggle enable/disable
    extensionToggle.addEventListener("change", () => {
        const enabled = extensionToggle.checked;
        updateControlsState(enabled);
        chrome.storage.sync.set({extensionEnabled: enabled});

        // Notify background to (re)start suspension logic
        chrome.runtime.sendMessage({
            action: enabled ? "suspend:enable" : "suspend:disable"
        });
    });

    // ✅ Suspend time change
    suspendTimeInput.addEventListener("input", () => {
        let value = parseInt(suspendTimeInput.value);
        if (
            isNaN(value) ||
            value < DEFAULT_CONFIG.MIN_SUSPEND_TIME_MINUTES ||
            value > DEFAULT_CONFIG.MAX_SUSPEND_TIME_MINUTES
        ) {
            value = DEFAULT_CONFIG.DEFAULT_SUSPEND_TIME / 60000;
        }
        chrome.storage.sync.set({suspendTime: value * 60000});
    });

    // ✅ Manage exclusions
    const saveExcludedSites = (sites) => {
        chrome.storage.sync.set({excludedSites: sites});
        updateExclusionList(sites);
    };

    const updateExclusionList = (sites) => {
        excludedList.innerHTML = "";
        sites.sort().forEach(site => {
            const li = document.createElement("li");
            li.className = "list-group-item d-flex justify-content-between align-items-center px-2 py-1";

            const text = document.createElement("span");
            text.textContent = site;

            const removeBtn = document.createElement("button");
            removeBtn.className = "btn btn-sm btn-outline-danger py-0 px-1";
            removeBtn.textContent = "❌";
            removeBtn.onclick = () => {
                const updated = sites.filter(s => s !== site);
                saveExcludedSites(updated);
            };

            li.appendChild(text);
            li.appendChild(removeBtn);
            excludedList.appendChild(li);
        });
    };

    addCurrentTabButton.addEventListener("click", () => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (!tabs[0]?.url) return;
            const host = new URL(tabs[0].url).hostname;
            chrome.storage.sync.get(["excludedSites"], (data) => {
                const sites = data.excludedSites || [];
                if (!sites.includes(host)) {
                    sites.push(host);
                    saveExcludedSites(sites);
                }
            });
        });
    });

    clearExclusionsButton.addEventListener("click", () => {
        saveExcludedSites([]);
    });

    loadRecommendedButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({action: "getRecommendedSites"}, (response) => {
            if (!response?.sites) {
                errorMessage.textContent = "Error loading recommended sites.";
                return;
            }

            chrome.storage.sync.get(["excludedSites"], (data) => {
                const existing = data.excludedSites || [];
                const merged = Array.from(new Set([...existing, ...response.sites]));
                saveExcludedSites(merged);
            });
        });
    });

    // ✅ Manual freeze/unfreeze for all tabs
    freezeAllTabsButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({action: "freezeAll"});
    });

    unfreezeAllTabsButton.addEventListener("click", () => {
        chrome.runtime.sendMessage({action: "unfreezeAll"});
    });
    const forceCheckButton = document.getElementById("forceCheck");

    if (forceCheckButton) {
        forceCheckButton.addEventListener("click", () => {
            chrome.runtime.sendMessage({action: "suspend:forceCheck"}, (response) => {
                console.log("[FORCE CHECK]", response);
            });
        });
    }


    function updateControlsState(enabled) {
        controlsContainer.classList.toggle("disabled", !enabled);
        controlsContainer.querySelectorAll("button").forEach(btn => {
            btn.disabled = !enabled;
        });
    }

    // ✅ Load version info
    const {version} = chrome.runtime.getManifest();
    const titleEl = document.getElementById("extensionTitle");
    const nameSpan = titleEl?.querySelector("span:first-child");
    if (nameSpan && version) {
        nameSpan.textContent = `Tab Sentinel v${version}`;
    }
    // ✅ Show current active tab label (right side of header)
    const labelSpan = document.getElementById("currentTabLabel");

    const tabMap = {
        "nav-home": "🏠 Home",
        "nav-suspender": "🛏️ Suspender",
        "nav-cookie": "🍪 Cookie Manager",
        "nav-popupblocker": "🛑 Popup Blocker",
        "nav-about": "ℹ️ About"
    };

    const setTabLabel = (id) => {
        const shortId = id.replace("-tab", "");
        labelSpan.textContent = tabMap[shortId] || "";
    };

// Init current label
    const activeTab = document.querySelector(".nav-link.active")?.id;
    if (activeTab) setTabLabel(activeTab);

// Update label on tab switch
    let cookieTabInitialized = false;
    let popupBlockerInitialized = false;

    let cookieTabLoaded = false;

    document.querySelectorAll(".nav-link").forEach(link => {
        link.addEventListener("shown.bs.tab", e => {
            const id = e.target.id;

            if (id === "nav-cookie-tab" && typeof window.loadCookieTab === "function" && !cookieTabLoaded) {
                cookieTabLoaded = true;
                window.loadCookieTab();
            }

            if (id === "nav-popupblocker-tab" && typeof window.initPopupBlockerTab === "function") {
                window.initPopupBlockerTab();
            }

            if (id === "nav-suspender-tab" && !window.suspenderTabInitialized) {
                window.suspenderTabInitialized = true;
                initSuspenderTab();
            }
        });
    });


    document.getElementById("nav-suspender-tab")?.addEventListener("shown.bs.tab", () => {
        if (!window.suspenderTabInitialized) {
            window.suspenderTabInitialized = true;
            initSuspenderTab(); // 👈 новая функция с логикой инициализации
        }
    });

    function initSuspenderTab() {
        const suspendTimeInput = document.getElementById("suspendTime");
        const extensionToggle = document.getElementById("extensionToggle");
        const addCurrentTabButton = document.getElementById("addCurrentTab");
        const clearExclusionsButton = document.getElementById("clearExclusions");
        const loadRecommendedButton = document.getElementById("loadRecommended");
        const freezeAllTabsButton = document.getElementById("freezeAllTabs");
        const unfreezeAllTabsButton = document.getElementById("unfreezeAllTabs");
        const excludedList = document.getElementById("excludedList");
        const controlsContainer = document.getElementById("controlsContainer");
        const errorMessage = document.getElementById("errorMessage");
        const forceCheckButton = document.getElementById("forceCheck");

        suspendTimeInput.min = DEFAULT_CONFIG.MIN_SUSPEND_TIME_MINUTES;
        suspendTimeInput.max = DEFAULT_CONFIG.MAX_SUSPEND_TIME_MINUTES;

        chrome.storage.sync.get(["extensionEnabled", "suspendTime", "excludedSites"], (data) => {
            const enabled = data.extensionEnabled !== false;
            extensionToggle.checked = enabled;
            const suspenderStatusValue = document.getElementById("suspenderStatusValue");
            if (suspenderStatusValue) {
                suspenderStatusValue.textContent = enabled ? "Enabled ✅" : "Disabled ⛔";
                suspenderStatusValue.classList.toggle("text-success", enabled);
                suspenderStatusValue.classList.toggle("text-danger", !enabled);
            }

            updateControlsState(enabled);

            let suspendMs = data.suspendTime ?? DEFAULT_CONFIG.DEFAULT_SUSPEND_TIME;
            if (typeof suspendMs !== "number") {
                suspendMs = DEFAULT_CONFIG.DEFAULT_SUSPEND_TIME;
                chrome.storage.sync.set({suspendTime: suspendMs});
            }

            let excludedSites = data.excludedSites ?? DEFAULT_CONFIG.DEFAULT_EXCLUDED_SITES;
            if (!Array.isArray(excludedSites)) {
                excludedSites = [...DEFAULT_CONFIG.DEFAULT_EXCLUDED_SITES];
                chrome.storage.sync.set({excludedSites});
            }

            suspendTimeInput.value = suspendMs / 60000;
            updateExclusionList(excludedSites);
        });

        extensionToggle.addEventListener("change", () => {
            const enabled = extensionToggle.checked;
            updateControlsState(enabled);
            chrome.storage.sync.set({extensionEnabled: enabled});
            chrome.runtime.sendMessage({
                action: enabled ? "suspend:enable" : "suspend:disable"
            });
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
            chrome.storage.sync.set({suspendTime: value * 60000});
        });

        const saveExcludedSites = (sites) => {
            chrome.storage.sync.set({excludedSites: sites});
            updateExclusionList(sites);
        };

        const updateExclusionList = (sites) => {
            excludedList.innerHTML = "";
            sites.sort().forEach(site => {
                const li = document.createElement("li");
                li.className = "list-group-item d-flex justify-content-between align-items-center px-2 py-1";
                const text = document.createElement("span");
                text.textContent = site;
                const removeBtn = document.createElement("button");
                removeBtn.className = "btn btn-sm btn-outline-danger py-0 px-1";
                removeBtn.textContent = "❌";
                removeBtn.onclick = () => {
                    const updated = sites.filter(s => s !== site);
                    saveExcludedSites(updated);
                };
                li.appendChild(text);
                li.appendChild(removeBtn);
                excludedList.appendChild(li);
            });
        };

        addCurrentTabButton.addEventListener("click", () => {
            chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
                if (!tabs[0]?.url) return;
                const host = new URL(tabs[0].url).hostname;
                chrome.storage.sync.get(["excludedSites"], (data) => {
                    const sites = data.excludedSites || [];
                    if (!sites.includes(host)) {
                        sites.push(host);
                        saveExcludedSites(sites);
                    }
                });
            });
        });

        clearExclusionsButton.addEventListener("click", () => {
            saveExcludedSites([]);
        });

        loadRecommendedButton.addEventListener("click", () => {
            chrome.runtime.sendMessage({action: "getRecommendedSites"}, (response) => {
                if (!response?.sites) {
                    errorMessage.textContent = "Error loading recommended sites.";
                    return;
                }

                chrome.storage.sync.get(["excludedSites"], (data) => {
                    const existing = data.excludedSites || [];
                    const merged = Array.from(new Set([...existing, ...response.sites]));
                    saveExcludedSites(merged);
                });
            });
        });

        freezeAllTabsButton.addEventListener("click", () => {
            chrome.runtime.sendMessage({action: "freezeAll"});
        });

        unfreezeAllTabsButton.addEventListener("click", () => {
            chrome.runtime.sendMessage({action: "unfreezeAll"});
        });

        if (forceCheckButton) {
            forceCheckButton.addEventListener("click", () => {
                chrome.runtime.sendMessage({action: "suspend:forceCheck"}, (response) => {
                    console.log("[FORCE CHECK]", response);
                });
            });
        }

        function updateControlsState(enabled) {
            controlsContainer.classList.toggle("disabled", !enabled);
            controlsContainer.querySelectorAll("button").forEach(btn => {
                btn.disabled = !enabled;
            });
        }
    }

});
