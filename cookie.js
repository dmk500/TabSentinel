import {classifyCookies} from './cookieClassifier.js';

let allGroupedCookies = [];
let currentType = "essential";
let currentSortField = "name";
let sortAsc = true;

document.addEventListener("DOMContentLoaded", () => {
    const cookieTab = document.getElementById("tab2");
    if (!cookieTab) return;
    loadCookieTab();
});

async function loadCookieTab() {
    const response = await fetch(chrome.runtime.getURL("cookie.html"));
    const html = await response.text();
    document.getElementById("tab2").innerHTML = html;
    await loadAndClassifyCookies();
    attachEventHandlers();
}

function loadAndClassifyCookies() {
    chrome.runtime.sendMessage({action: "getAllCookies"}, (cookies) => {
        chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            const url = new URL(tabs[0].url);
            const host = url.hostname;
            allGroupedCookies = classifyCookies(cookies, [host]);
            renderCookieTable();
        });
    });
}

function renderCookieTable() {
    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const whitelist = new Set((data.cookieWhitelist || []).map(d => d.trim().toLowerCase()));

        const filtered = allGroupedCookies.filter(c => {
            if (currentType === "whitelist") return whitelist.has(c.domain.toLowerCase());
            return c.type === currentType && !whitelist.has(c.domain.toLowerCase());
        });

        const grouped = {};
        filtered.forEach(c => {
            const domain = c.domain.toLowerCase();
            if (!grouped[domain]) {
                grouped[domain] = {
                    domain,
                    count: c.count,
                    name: "Multiple cookies",
                    type: c.type,
                    pathList: [...(c.pathList || [])],
                };
            } else {
                grouped[domain].count += c.count;
            }
        });


        updateTabCounters();
        renderFilteredTable(Object.values(grouped));
    });
}

function renderFilteredTable(cookies) {
    const tbody = document.getElementById("cookieTableBody");
    if (!tbody) return;

    const sorted = cookies.sort((a, b) => {
        const valA = a[currentSortField].toString().toLowerCase();
        const valB = b[currentSortField].toString().toLowerCase();
        return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });

    tbody.innerHTML = sorted.length === 0
        ? `<tr><td colspan="4">No cookies found.</td></tr>`
        : "";

    sorted.forEach(cookie => {
        const row = document.createElement("tr");
        row.innerHTML = `
      <td title="${cookie.name}">${cookie.name}</td>
      <td title="${cookie.domain}">${cookie.domain}</td>
      <td>${cookie.count}</td>
      <td>
        <span class="cookie-actions">
          <button class="whitelist-btn" data-domain="${cookie.domain}">✅</button>
          <button class="delete-btn" data-name="${cookie.name}" data-domain="${cookie.domain}">🗑</button>
        </span>
      </td>
    `;
        tbody.appendChild(row);
    });
}

function updateTabCounters() {
    const tabs = {
        essential: 0,
        analytics: 0,
        suspicious: 0,
        whitelist: 0
    };

    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const whitelist = new Set((data.cookieWhitelist || []).map(d => d.trim().toLowerCase()));
        allGroupedCookies.forEach(c => {
            const key = `${c.name}@${c.domain}`;
            if (whitelist.has(c.domain.toLowerCase())) tabs.whitelist++;
            else tabs[c.type]++;
        });

        document.querySelectorAll(".cookie-tab-btn").forEach(btn => {
            const type = btn.dataset.type;
            if (tabs[type] !== undefined) {
                const label = btn.innerText.split(" ")[0]; // icon only
                btn.innerHTML = `${label} ${capitalize(type)} (${tabs[type]})`;
            }
        });
    });
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function attachEventHandlers() {
    document.getElementById("refreshCookiesBtn").addEventListener("click", loadAndClassifyCookies);

    document.querySelectorAll(".cookie-tab-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".cookie-tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentType = btn.dataset.type;
            renderCookieTable();
        });
    });

    document.querySelectorAll("th[data-sort]").forEach(th => {
        th.addEventListener("click", () => {
            const sortField = th.dataset.sort;
            currentSortField = sortField;
            sortAsc = !sortAsc;
            renderCookieTable();
        });
    });

    document.getElementById("cookieTableBody").addEventListener("click", (e) => {
        const target = e.target;
        const domain = target.dataset.domain;

        if (target.classList.contains("whitelist-btn")) {
            chrome.storage.sync.get(["cookieWhitelist"], (data) => {
                const whitelist = new Set((data.cookieWhitelist || []).map(d => d.trim().toLowerCase()));
                whitelist.add(domain.toLowerCase());
                chrome.storage.sync.set({cookieWhitelist: Array.from(whitelist)}, loadAndClassifyCookies);
            });
        }

        if (target.classList.contains("delete-btn")) {
            console.log(`🗑 TODO: implement delete for ${target.dataset.name}@${domain}`);
        }
    });
}
