import { classifyCookies } from './cookieClassifier.js';
import { DEFAULT_CONFIG } from './config.js';

function log(...args) {
    if (DEFAULT_CONFIG.ENABLE_COOKIE_LOGS) {
        console.log("[COOKIE]", ...args);
    }
}

let allGroupedCookies = [];
let currentType = "essential";
let currentSortField = "name";
let sortAsc = true;

// 🔄 Safe initialization
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => loadCookieTab());
} else {
    loadCookieTab();
}

window.loadCookieTab = loadCookieTab;

async function loadCookieTab() {
    log("🔄 Loading cookie.html...");
    const response = await fetch(chrome.runtime.getURL("cookie.html"));
    const html = await response.text();
    document.getElementById("tab2").innerHTML = html;
    log("✅ Injected cookie.html");
    await loadAndClassifyCookies();
    attachEventHandlers();
}

window.loadCookieTab = loadCookieTab;
// Safe initialization if DOM already loaded
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        const cookieTab = document.getElementById("tab2");
        if (!cookieTab) return;
        loadCookieTab();
    });
} else {
    const cookieTab = document.getElementById("tab2");
    if (cookieTab) loadCookieTab();
}

function attachEventHandlers() {
    const clickHandlers = [
        { match: el => el.closest(".cookie-tab-btn"), handler: handleTabSwitch },
        { match: el => el.closest("th[data-sort]"), handler: handleSort },
        { match: el => el.classList.contains("delete-btn"), handler: handleBulkDelete },
        { match: el => el.classList.contains("delete-single-btn"), handler: handleSingleDelete },
        { match: el => el.classList.contains("whitelist-btn") || el.classList.contains("whitelist-single-btn"), handler: handleAddToWhitelist },
        { match: el => el.classList.contains("remove-whitelist-btn"), handler: handleRemoveFromWhitelist },
        { match: el => el.closest(".expand-toggle"), handler: handleRowExpand }
    ];

    document.addEventListener("click", (e) => {
        const target = e.target;
        for (const { match, handler } of clickHandlers) {
            if (match(target)) {
                handler(e);
                break;
            }
        }
    });

    document.querySelector(".refresh-cookies")?.addEventListener("click", loadAndClassifyCookies);
}

function handleTabSwitch(e) {
    const btn = e.target.closest(".cookie-tab-btn");
    if (!btn) return;
    document.querySelectorAll(".cookie-tab-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentType = btn.dataset.type;
    renderCookieTable();
}

function handleRowExpand(e) {
    const row = e.target.closest("tr.cookie-row");
    if (!row) return;
    const domain = row.querySelector("td[data-domain]")?.dataset.domain;
    const next = row.parentElement.querySelector(`tr.cookie-details[data-domain="${domain}"]`);
    const arrow = row.querySelector(".arrow");

    if (next) {
        next.classList.toggle("visible");
        row.classList.toggle("open");
        if (arrow) arrow.innerText = next.classList.contains("visible") ? "▼" : "▶";
    }
}

function loadAndClassifyCookies() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        const url = new URL(tab.url);
        const host = url.hostname;

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => {
                const domains = new Set();
                ['src', 'href', 'action'].forEach(attr => {
                    document.querySelectorAll(`[${attr}]`).forEach(el => {
                        try {
                            const val = el.getAttribute(attr);
                            const url = new URL(val, document.baseURI);
                            if (url.hostname !== location.hostname) domains.add(url.hostname);
                        } catch (_) {}
                    });
                });
                if (performance.getEntriesByType) {
                    performance.getEntriesByType("resource").forEach(entry => {
                        try {
                            const url = new URL(entry.name);
                            if (url.hostname !== location.hostname) domains.add(url.hostname);
                        } catch (_) {}
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

function domainMatches(cookieDomain, pageHost) {
    const clean = cookieDomain.replace(/^\./, "").toLowerCase();
    return clean === pageHost || pageHost.endsWith("." + clean) || clean.endsWith("." + pageHost);
}


function updateTabCounters() {
    const tabs = { essential: 0, analytics: 0, suspicious: 0, whitelist: 0 };
    const labels = {
        essential: "🔐 Essential",
        analytics: "📊 Analytics",
        suspicious: "⚠️ Suspicious",
        whitelist: "✅ Whitelist"
    };

    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const whitelist = new Set((data.cookieWhitelist || []).map(d => d.trim().toLowerCase()));
        allGroupedCookies.forEach(c => {
            if (whitelist.has(c.domain.toLowerCase())) tabs.whitelist++;
            else if (tabs.hasOwnProperty(c.type)) tabs[c.type]++;
        });

        document.querySelectorAll(".cookie-tab-btn").forEach(btn => {
            const type = btn.dataset.type;
            if (tabs[type] !== undefined) {
                btn.innerText = `${labels[type]} (${tabs[type]})`;
            }
        });
    });
}



function renderCurrentTabCookies(rawCookies, host, embeddedHosts) {
    log("Rendering current tab cookies", {
        host,
        embeddedHosts,
        rawCookiesCount: rawCookies.length
    });

    const mainTbody = document.getElementById("currentTabCookieTableBody");
    if (!mainTbody) return;

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

        mainTbody.innerHTML = "";

        const sortedMain = Object.values(main).sort((a, b) => b.cookies.length - a.cookies.length);
        const sortedEmbedded = Object.values(embedded).sort((a, b) => b.cookies.length - a.cookies.length);
        const allRows = [
            ...sortedMain.map(g => ({...g, thirdParty: false})),
            ...sortedEmbedded.map(g => ({...g, thirdParty: true}))
        ];

        allRows.forEach(group => {
            const isWhitelisted = whitelist.has(group.domain);
            const row = document.createElement("tr");
            row.classList.add("cookie-row", "expand-toggle");
            if (isWhitelisted) row.classList.add("whitelisted");
            else if (group.thirdParty) row.classList.add("third-party");

            let actionHtml = isWhitelisted
                ? `<button class="delete-btn" data-domain="${group.domain}">🗑</button>`
                : `<button class="whitelist-btn" data-domain="${group.domain}">✅</button>
                   <button class="delete-btn" data-domain="${group.domain}">🗑</button>`;

            const label = group.thirdParty ? `<div class="small-note">Third-party</div>` : "";

            row.innerHTML = `
<td data-domain="${group.domain}"><span class="arrow">▶</span><strong>${group.domain}</strong>${label}</td>
<td class="count-cell">${group.cookies.length}</td>
<td><span class="cookie-actions">${actionHtml}</span></td>`;
            mainTbody.appendChild(row);

            const detailRow = document.createElement("tr");
            detailRow.className = "cookie-details";
            detailRow.dataset.domain = group.domain;
            detailRow.innerHTML = `
  <td colspan="3">
    ${group.cookies.map(c => `
      <div class="cookie-item">
          <div><strong>${c.name}</strong> = ${c.value}</div>
          <div class="cookie-meta">
              <strong>${c.domain}</strong> | Path: ${c.path}, Secure: ${c.secure}, HttpOnly: ${c.httpOnly}
              <span class="cookie-actions-inline">
                  <button class="whitelist-single-btn" data-name="${c.name}" data-domain="${c.domain}">✅</button>
                  <button class="delete-single-btn" data-name="${c.name}" data-domain="${c.domain}">🗑</button>
              </span>
          </div>
      </div>`).join("")}
  </td>`;
            mainTbody.appendChild(detailRow);
        });
    });
}


function handleSort(e) {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    currentSortField = th.dataset.sort;
    sortAsc = !sortAsc;
    log("Sorting by:", currentSortField, sortAsc ? "ASC" : "DESC");
    renderCookieTable();
}

function handleBulkDelete(e) {
    const domain = e.target.dataset.domain;
    log("Bulk delete for domain:", domain);
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

function handleSingleDelete(e) {
    const domain = e.target.dataset.domain;
    const name = e.target.dataset.name;
    log("Delete single cookie:", name, domain);
    chrome.cookies.remove({url: `https://${domain}`, name}, () => {
        setTimeout(loadAndClassifyCookies, 300);
    });
}

function handleAddToWhitelist(e) {
    const domain = e.target.dataset.domain;
    log("Adding to whitelist:", domain);
    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const whitelist = new Set((data.cookieWhitelist || []).map(d => d.trim().toLowerCase()));
        whitelist.add(domain.toLowerCase());
        chrome.storage.sync.set({cookieWhitelist: Array.from(whitelist)}, loadAndClassifyCookies);
    });
}

function handleRemoveFromWhitelist(e) {
    const domain = e.target.dataset.domain;
    log("Removing from whitelist:", domain);
    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const whitelist = new Set((data.cookieWhitelist || []).map(d => d.trim().toLowerCase()));
        whitelist.delete(domain.toLowerCase());
        chrome.storage.sync.set({cookieWhitelist: Array.from(whitelist)}, loadAndClassifyCookies);
    });
}



function renderCookieTable() {
    log("Rendering cookie table for type:", currentType);
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
                    pathList: [...(c.pathList || [])]
                };
            } else {
                grouped[domain].count += c.count;
            }
        });

        updateTabCounters();

        const tbody = document.getElementById("cookieTableBody");
        if (tbody) {
            tbody.innerHTML = "";
            renderFilteredTable(Object.values(grouped), tbody);
        }
    });
}

function renderFilteredTable(cookieList) {
    log("Rendering filtered table, total domains:", cookieList.length);
    const tbody = document.getElementById("cookieTableBody");
    tbody.innerHTML = "";

    cookieList.forEach(cookie => {
        const tr = document.createElement("tr");
        tr.classList.add("cookie-row", "expand-toggle");

        // Колонка с доменом
        const domainTd = document.createElement("td");
        domainTd.setAttribute("data-domain", cookie.domain);
        domainTd.innerHTML = `<span class="arrow">▶</span><strong>${cookie.domain}</strong>`;
        tr.appendChild(domainTd);

        // Колонка с числом cookies
        const countTd = document.createElement("td");
        countTd.classList.add("count-cell");
        countTd.textContent = cookie.count;
        tr.appendChild(countTd);

        // Колонка с действиями
        const actionsTd = document.createElement("td");
        actionsTd.classList.add("actions-cell");
        const actionsSpan = document.createElement("span");
        actionsSpan.className = "cookie-actions";

        // Кнопка whitelist
        const whitelistBtn = document.createElement("button");
        whitelistBtn.className = "whitelist-btn";
        whitelistBtn.textContent = "✅";
        whitelistBtn.dataset.domain = cookie.domain;
        actionsSpan.appendChild(whitelistBtn);

        // Кнопка delete
        const deleteBtn = document.createElement("button");
        deleteBtn.className = "delete-btn";
        deleteBtn.textContent = "🗑";
        deleteBtn.dataset.domain = cookie.domain;
        actionsSpan.appendChild(deleteBtn);

        actionsTd.appendChild(actionsSpan);
        tr.appendChild(actionsTd);

        tbody.appendChild(tr);

        // Создаём скрытую строку с подробностями
        const detailTr = document.createElement("tr");
        detailTr.classList.add("cookie-details");
        detailTr.setAttribute("data-domain", cookie.domain);

        const detailTd = document.createElement("td");
        detailTd.setAttribute("colspan", "3");

        if (cookie.cookies) {
            cookie.cookies.forEach(c => {
                const item = document.createElement("div");
                item.className = "cookie-item";

                const valueDiv = document.createElement("div");
                valueDiv.innerHTML = `<strong>${c.name}</strong> = ${c.value}`;
                item.appendChild(valueDiv);

                const metaDiv = document.createElement("div");
                metaDiv.className = "cookie-meta";
                metaDiv.innerHTML = `
                    <strong>${c.domain}</strong> | Path: ${c.path}, Secure: ${c.secure}, HttpOnly: ${c.httpOnly}
                    <span class="cookie-actions-inline">
                        <button class="whitelist-single-btn" data-name="${c.name}" data-domain="${c.domain}">✅</button>
                        <button class="delete-single-btn" data-name="${c.name}" data-domain="${c.domain}">🗑</button>
                    </span>
                `;
                item.appendChild(metaDiv);

                detailTd.appendChild(item);
            });
        }

        detailTr.appendChild(detailTd);
        tbody.appendChild(detailTr);
    });
    updateDeleteButton(cookieList);

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



