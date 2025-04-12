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

function domainMatches(cookieDomain, pageHost) {
    const clean = cookieDomain.startsWith(".") ? cookieDomain.slice(1) : cookieDomain;
    return pageHost === clean || pageHost.endsWith("." + clean);
}

function loadAndClassifyCookies() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const tab = tabs[0];
        const url = new URL(tab.url);
        const host = url.hostname;

        // Выполняем скрипт только при открытии вкладки Cookie
        chrome.scripting.executeScript({
            target: {tabId: tab.id},
            func: () => {
                const domains = new Set();

                // 1. DOM-based embedded URLs
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

                // 2. Loaded resources via JS/fetch/XHR/iframes/etc
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
            const embeddedHosts = results?.[0]?.result || [];

            chrome.cookies.getAll({}, (cookies) => {
                allGroupedCookies = classifyCookies(cookies, [host]);
                renderCookieTable();
                renderCurrentTabCookies(cookies, host, embeddedHosts);
            });
        });
    });
}

function renderCurrentTabCookies(rawCookies, host, embeddedHosts) {
    const mainTbody = document.getElementById("currentTabCookieTableBody");
    const embedTbody = document.getElementById("embeddedCookieTableBody");
    if (!mainTbody || !embedTbody) return;

    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const whitelist = new Set((data.cookieWhitelist || []).map(d => d.trim().toLowerCase()));
        const embeddedSet = new Set(embeddedHosts.map(d => d.toLowerCase()));

        console.log("📦 Embedded domains from script:", embeddedSet);
        console.log("🍪 All raw cookies:", rawCookies.map(c => c.domain));

        const main = {};
        const embedded = {};

        rawCookies.forEach(c => {
            const domain = c.domain.toLowerCase();

            // check if domain matches main host
            if (domainMatches(domain, host)) {
                if (!main[domain]) main[domain] = { domain, cookies: [] };
                main[domain].cookies.push(c);
            }
            // check if domain matches embedded domains
            else {
  const normalizedDomain = domain.replace(/^\./, "");
  if (
    embeddedSet.has(normalizedDomain) ||
    embeddedSet.has(domain) ||
    [...embeddedSet].some(ed =>
      normalizedDomain === ed || normalizedDomain.endsWith("." + ed)
    )
  ) {
    if (!embedded[domain]) embedded[domain] = { domain, cookies: [] };
    embedded[domain].cookies.push(c);
  }
}

            // {
            //     if (!embedded[domain]) embedded[domain] = { domain, cookies: [] };
            //     embedded[domain].cookies.push(c);
            // }
        });

        const render = (tbody, grouped) => {
            const sorted = Object.values(grouped).sort((a, b) => b.cookies.length - a.cookies.length);
            tbody.innerHTML = sorted.length === 0
                ? `<tr><td colspan="3">No cookies</td></tr>`
                : "";

            sorted.forEach(group => {
                const isWhitelisted = whitelist.has(group.domain);
                const row = document.createElement("tr");
                row.className = `cookie-row ${isWhitelisted ? 'whitelisted' : ''}`;
                row.innerHTML = `
                    <td class="expand-toggle" data-domain="${group.domain}">
                        <span class="arrow">▶</span>
                        <span>${group.domain}</span>
                    </td>
                    <td>${group.cookies.length}</td>
                    <td>
                        <span class="cookie-actions">
                            ${isWhitelisted ? '' : `<button class="whitelist-btn" data-domain="${group.domain}">✅</button>`}
                            <button class="delete-btn" data-domain="${group.domain}">🗑</button>
                        </span>
                    </td>
                `;
                tbody.appendChild(row);

                const detailRow = document.createElement("tr");
                detailRow.className = "cookie-details";
                detailRow.innerHTML = `
                    <td colspan="3">
                        ${group.cookies.map(c => `
                            <div class="cookie-item">
                                <div><strong>${c.name}</strong> = ${c.value}</div>
                                <div class="cookie-meta">
                                    Domain: ${c.domain}, Path: ${c.path}, Secure: ${c.secure}, HttpOnly: ${c.httpOnly}
                                    <span class="cookie-actions-inline">
                                        <button class="whitelist-single-btn" data-name="${c.name}" data-domain="${c.domain}">✅</button>
                                        <button class="delete-single-btn" data-name="${c.name}" data-domain="${c.domain}">🗑</button>
                                    </span>
                                </div>
                            </div>
                        `).join('')}
                    </td>
                `;
                tbody.appendChild(detailRow);
            });
        };

        render(mainTbody, main);
        render(embedTbody, embedded);
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
            if (whitelist.has(c.domain.toLowerCase())) tabs.whitelist++;
            else tabs[c.type]++;
        });

        document.querySelectorAll(".cookie-tab-btn").forEach(btn => {
            const type = btn.dataset.type;
            if (tabs[type] !== undefined) {
                const label = btn.innerText.split(" ")[0];
                btn.innerHTML = `${label} ${capitalize(type)} (${tabs[type]})`;
            }
        });
    });
}

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

function attachEventHandlers() {
    const refreshBtn = document.querySelector(".refresh-cookies");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", loadAndClassifyCookies);
    }

    document.addEventListener("click", (e) => {
        const btn = e.target.closest(".cookie-tab-btn");
        if (btn && btn.dataset.type) {
            document.querySelectorAll(".cookie-tab-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            currentType = btn.dataset.type;
            renderCookieTable();
            return;
        }

        const th = e.target.closest("th[data-sort]");
        if (th) {
            currentSortField = th.dataset.sort;
            sortAsc = !sortAsc;
            renderCookieTable();
            return;
        }

        const target = e.target;
        const domain = target.dataset.domain;
        const name = target.dataset.name;

        if (target.classList.contains("whitelist-btn")) {
            chrome.storage.sync.get(["cookieWhitelist"], (data) => {
                const whitelist = new Set((data.cookieWhitelist || []).map(d => d.trim().toLowerCase()));
                whitelist.add(domain.toLowerCase());
                chrome.storage.sync.set({cookieWhitelist: Array.from(whitelist)}, loadAndClassifyCookies);
            });
        }

        if (target.classList.contains("whitelist-single-btn")) {
            console.log(`✅ Add to whitelist: ${name}@${domain}`);
        }

        if (target.classList.contains("delete-btn")) {
            console.log(`🗑 TODO: delete ALL for domain ${domain}`);
        }

        if (target.classList.contains("delete-single-btn")) {
            console.log(`🗑 Delete one: ${name}@${domain}`);
        }

        const toggle = e.target.closest(".expand-toggle");
        if (toggle) {
            const tr = toggle.closest("tr");
            const next = tr.nextElementSibling;
            const arrow = toggle.querySelector(".arrow");
            if (next && next.classList.contains("cookie-details")) {
                next.classList.toggle("visible");
                toggle.classList.toggle("open");
                if (arrow) {
                    arrow.innerText = next.classList.contains("visible") ? "▼" : "▶";
                }
            }
        }
    });
}
