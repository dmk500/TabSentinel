import {classifyCookies} from './cookieClassifier.js';

let allGroupedCookies = [];
let currentType = "essential";
let currentSortField = "name";
let sortAsc = true;

// On tab load, inject cookie UI and run classification
document.addEventListener("DOMContentLoaded", () => {
    const cookieTab = document.getElementById("tab2");
    if (!cookieTab) return;
    loadCookieTab();
});

// Loads cookie.html and runs embedded resource scan
async function loadCookieTab() {
    const response = await fetch(chrome.runtime.getURL("cookie.html"));
    const html = await response.text();
    document.getElementById("tab2").innerHTML = html;
    await loadAndClassifyCookies();
    attachEventHandlers();
}

// Check if cookie domain matches the current page host
function domainMatches(cookieDomain, pageHost) {
    const clean = cookieDomain.startsWith(".") ? cookieDomain.slice(1) : cookieDomain;
    return pageHost === clean || pageHost.endsWith("." + clean);
}

// Get cookies and extract embedded domains from the page
function loadAndClassifyCookies() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const tab = tabs[0];
        const url = new URL(tab.url);
        const host = url.hostname;

        chrome.scripting.executeScript({
            target: {tabId: tab.id},
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
            const embeddedHosts = results?.[0]?.result || [];
            chrome.cookies.getAll({}, (cookies) => {
                allGroupedCookies = classifyCookies(cookies, [host]);
                renderCookieTable();
                renderCurrentTabCookies(cookies, host, embeddedHosts);
            });
        });
    });
}

// Renders both main and embedded cookie tables
function renderCurrentTabCookies(rawCookies, host, embeddedHosts) {
    const mainTbody = document.getElementById("currentTabCookieTableBody");
    const embedTbody = document.getElementById("embeddedCookieTableBody");
    if (!mainTbody || !embedTbody) return;

    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const whitelist = new Set((data.cookieWhitelist || []).map(d => d.trim().toLowerCase()));
        const embeddedSet = new Set(embeddedHosts.map(d => d.toLowerCase()));

        const main = {};
        const embedded = {};

        rawCookies.forEach(c => {
            const domain = c.domain.toLowerCase();
            const normalizedDomain = domain.replace(/^\./, "");

            if (domainMatches(domain, host)) {
                if (!main[domain]) main[domain] = {domain, cookies: []};
                main[domain].cookies.push(c);
            } else if (
                embeddedSet.has(normalizedDomain) ||
                embeddedSet.has(domain) ||
                [...embeddedSet].some(ed =>
                    normalizedDomain === ed || normalizedDomain.endsWith("." + ed)
                )
            ) {
                if (!embedded[domain]) embedded[domain] = {domain, cookies: []};
                embedded[domain].cookies.push(c);
            }
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
<!--                                <div class="cookie-meta">-->
<!--                                    Domain: ${c.domain}, Path: ${c.path}, Secure: ${c.secure}, HttpOnly: ${c.httpOnly}-->
                                <div class="cookie-meta">
                                    <strong>${c.domain}</strong> | Path: ${c.path}, Secure: ${c.secure}, HttpOnly: ${c.httpOnly}
    
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

// Render summary cookie table for type tabs
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

// Renders main tab table by type
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
    // Основная строка
    const row = document.createElement("tr");
    row.className = "cookie-row";
    row.innerHTML = `
        <td class="expand-toggle" data-domain="${cookie.domain}">
            <span class="arrow">▶</span>
            <strong>${cookie.domain}</strong>
        </td>
        <td class="count-cell">${cookie.count}</td>
        <td>
            <span class="cookie-actions">
                <button class="whitelist-btn" data-domain="${cookie.domain}">✅</button>
                <button class="delete-btn" data-domain="${cookie.domain}">🗑</button>
            </span>
        </td>
    `;
    tbody.appendChild(row);

    // Строка с деталями
    const detailRow = document.createElement("tr");
    detailRow.className = "cookie-details";
    detailRow.innerHTML = `<td colspan="3"><div class="cookie-loading">Loading...</div></td>`;
    tbody.appendChild(detailRow);

    // Загрузка и отрисовка cookie деталей
    chrome.cookies.getAll({ domain: cookie.domain }, (domainCookies) => {
        const html = domainCookies.map(c => `
            <div class="cookie-item">
                <div><strong>${c.name}</strong> = ${c.value}</div>
                <div class="cookie-meta">
                    <strong>${c.domain}</strong>, Path: ${c.path}, Secure: ${c.secure}, HttpOnly: ${c.httpOnly}
                    <span class="cookie-actions-inline">
                        <button class="whitelist-single-btn" data-name="${c.name}" data-domain="${c.domain}">✅</button>
                        <button class="delete-single-btn" data-name="${c.name}" data-domain="${c.domain}">🗑</button>
                    </span>
                </div>
            </div>
        `).join("");

        detailRow.innerHTML = `<td colspan="3">${html || "No cookies found."}</td>`;
    });
});
updateDeleteButton(cookies);

}

function updateDeleteButton(cookies) {
    const panel = document.getElementById("cookieDeletePanel");
    const btn = document.getElementById("deleteByTypeBtn");

    if (!panel || !btn) return;

    if (currentType === "whitelist") {
        panel.style.display = "none";
        return;
    }

    const total = cookies.reduce((sum, c) => sum + c.count, 0);
    if (total === 0) {
        panel.style.display = "none";
        return;
    }

    const labelMap = {
        essential: "Delete Essential",
        analytics: "Delete Analytics",
        suspicious: "Delete Suspicious"
    };

    btn.innerText = `${labelMap[currentType]} (${total})`;
    panel.style.display = "flex";

    btn.onclick = () => {
        const domains = cookies.map(c => c.domain.toLowerCase());
        chrome.cookies.getAll({}, (all) => {
            let deleted = 0;

            all.forEach(c => {
                const cDomain = c.domain.replace(/^\./, "").toLowerCase();
                const matches = domains.includes(cDomain);

                if (matches) {
                    chrome.cookies.remove({
                        url: `${c.secure ? "https" : "http"}://${cDomain}${c.path}`,
                        name: c.name
                    }, (details) => {
                        if (details) deleted++;
                    });
                }
            });

            // Обновим UI через 600мс и покажем результат
            setTimeout(() => {
                loadAndClassifyCookies();

                const note = document.createElement("div");
                note.textContent = `Deleted ${deleted} cookies`;
                note.style.color = "green";
                note.style.fontSize = "12px";
                note.style.marginLeft = "10px";
                panel.appendChild(note);

                setTimeout(() => note.remove(), 4000);
            }, 600);
        });
    };
}


// Updates tab counters
function updateTabCounters() {
    const tabs = {essential: 0, analytics: 0, suspicious: 0, whitelist: 0};

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

// Capitalize first letter
function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

// Sets up click handlers
function attachEventHandlers() {
    document.querySelector(".refresh-cookies")?.addEventListener("click", loadAndClassifyCookies);

    document.addEventListener("click", (e) => {
        const target = e.target;
        const domain = target.dataset.domain;
        const name = target.dataset.name;

        if (target.closest(".cookie-tab-btn")) {
            document.querySelectorAll(".cookie-tab-btn").forEach(b => b.classList.remove("active"));
            target.classList.add("active");
            currentType = target.dataset.type;
            renderCookieTable();
        }

        if (target.closest("th[data-sort]")) {
            currentSortField = target.dataset.sort;
            sortAsc = !sortAsc;
            renderCookieTable();
        }

        if (target.classList.contains("delete-btn")) {
            chrome.cookies.getAll({domain}, (cookies) => {
                cookies.forEach(c => {
                    chrome.cookies.remove({
                        url: (c.secure ? "https://" : "http://") + c.domain + c.path,
                        name: c.name
                    });
                });
                setTimeout(loadAndClassifyCookies, 300);
            });
        }

        if (target.classList.contains("delete-single-btn")) {
            chrome.cookies.remove({
                url: `https://${domain}`,
                name
            }, () => {
                setTimeout(loadAndClassifyCookies, 300);
            });
        }

        if (target.classList.contains("whitelist-btn") || target.classList.contains("whitelist-single-btn")) {
            chrome.storage.sync.get(["cookieWhitelist"], (data) => {
                const whitelist = new Set((data.cookieWhitelist || []).map(d => d.trim().toLowerCase()));
                whitelist.add(domain.toLowerCase());
                chrome.storage.sync.set({cookieWhitelist: Array.from(whitelist)}, loadAndClassifyCookies);
            });
        }

        const toggle = target.closest(".expand-toggle");
        if (toggle) {
            const tr = toggle.closest("tr");
            const next = tr.nextElementSibling;
            const arrow = toggle.querySelector(".arrow");
            if (next && next.classList.contains("cookie-details")) {
                next.classList.toggle("visible");
                toggle.classList.toggle("open");
                if (arrow) arrow.innerText = next.classList.contains("visible") ? "▼" : "▶";
            }
        }
    });
}
