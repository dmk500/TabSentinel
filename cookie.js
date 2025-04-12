import {classifyCookies} from './cookieClassifier.js';

// Debugging flag and log wrapper
const DEBUG = true;

function log(...args) {
    if (DEBUG) console.log("[COOKIE]", ...args);
}

let allGroupedCookies = [];
let currentType = "essential";
let currentSortField = "name";
let sortAsc = true;

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
    log("DOMContentLoaded — initializing cookie tab");
    const cookieTab = document.getElementById("tab2");
    if (!cookieTab) {
        log("Tab2 not found. Aborting.");
        return;
    }
    loadCookieTab();
});

async function loadCookieTab() {
    log("Loading cookie.html into tab2");
    const response = await fetch(chrome.runtime.getURL("cookie.html"));
    const html = await response.text();
    const container = document.getElementById("tab2");
    if (!container) {
        log("Tab2 container not found.");
        return;
    }
    container.innerHTML = html;
    log("cookie.html inserted");
    await loadAndClassifyCookies();
    attachEventHandlers();
}

// List of element matchers and corresponding handler functions
const clickHandlers = [
    {
        match: el => el.closest(".cookie-tab-btn"),
        handler: handleTabSwitch
    },
    {
        match: el => el.closest("th[data-sort]"),
        handler: handleSort
    },
    {
        match: el => el.classList.contains("delete-btn"),
        handler: handleBulkDelete
    },
    {
        match: el => el.classList.contains("delete-single-btn"),
        handler: handleSingleDelete
    },
    {
        match: el => el.classList.contains("whitelist-btn") || el.classList.contains("whitelist-single-btn"),
        handler: handleAddToWhitelist
    },
    {
        match: el => el.classList.contains("remove-whitelist-btn"),
        handler: handleRemoveFromWhitelist
    },
    {
        match: el => el.closest("tr.cookie-row"),
        handler: handleRowExpand
    }
];

// Global document click handler with dispatch map
function attachEventHandlers() {
    log("Attaching global click handlers via dispatch map");

    document.addEventListener("click", (e) => {
        const target = e.target;
        log("CLICK EVENT:", target);
        for (const {match, handler} of clickHandlers) {
            if (match(target)) {
                log("Handler matched:", handler.name);
                handler(e);
                break;
            }
        }
    });

    const refreshBtn = document.querySelector(".refresh-cookies");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", () => {
            log("Manual refresh triggered");
            loadAndClassifyCookies();
        });
    }

    window.loadCookieTab = loadCookieTab;
}

// Handler: toggle expand/collapse for cookie rows
function handleRowExpand(e) {
    const row = e.target.closest("tr.cookie-row");
    if (!row) {
        log("No row found for expand");
        return;
    }
    const next = row.nextElementSibling;
    const arrow = row.querySelector(".arrow");
    log("Toggle expand row:", row);

    if (next && next.classList.contains("cookie-details")) {
        next.classList.toggle("visible");
        row.classList.toggle("open");
        if (arrow) arrow.innerText = next.classList.contains("visible") ? "▼" : "▶";
    }
}