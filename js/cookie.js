import {classifyCookies} from './cookieClassifier.js';
import {DEFAULT_CONFIG} from '../config.js';

function log(...args) {
    if (DEFAULT_CONFIG.ENABLE_COOKIE_LOGS) {
        console.log("[COOKIE]", ...args);
    }
}

let allGroupedCookies = [];
let currentType = "essential";
let currentSortField = "name";
let sortAsc = true;

// 👇 Добавим ленивую инициализацию
window.cookieTabInitialized = false;

window.loadCookieTab = async function () {
    if (window.cookieTabInitialized) return;
    window.cookieTabInitialized = true;

    log("🍪 Initializing Cookie Tab...");
    await loadAndClassifyCookies();
    attachEventHandlers();
};

function attachEventHandlers() {
    const clickHandlers = [
        {match: el => el.closest(".cookie-tab-btn"), handler: handleTabSwitch},
        {match: el => el.closest("th[data-sort]"), handler: handleSort},
        {match: el => el.classList.contains("delete-btn"), handler: handleBulkDelete},
        {match: el => el.classList.contains("delete-single-btn"), handler: handleSingleDelete},
        {match: el => el.classList.contains("whitelist-btn") || el.classList.contains("whitelist-single-btn"), handler: handleAddToWhitelist},
        {match: el => el.classList.contains("remove-whitelist-btn"), handler: handleRemoveFromWhitelist},
        {match: el => el.closest(".expand-toggle"), handler: handleRowExpand},
        {match: el => el.classList.contains("delete-btn"), handler: handleBulkDelete},
        {match: el => el.classList.contains("delete-single-btn"), handler: handleSingleDelete},
        {match: el => el.classList.contains("whitelist-btn") || el.classList.contains("whitelist-single-btn"), handler: handleAddToWhitelist},
        {match: el => el.classList.contains("remove-whitelist-btn"), handler: handleRemoveFromWhitelist},
    ];
    document.addEventListener("click", (e) => {
        const target = e.target;
        for (const {match, handler} of clickHandlers) {
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
    // const row = e.target.closest("tr.cookie-row");
    const row = e.target.closest("tr.expand-toggle");

    if (!row) return;
    const domain = row.querySelector("td[data-domain]")?.dataset.domain;
    const next = row.parentElement.querySelector(`tr.cookie-details[data-domain="${domain}"]`);
    const arrow = row.querySelector(".arrow");

    if (next) {
        next.classList.toggle("show");
        row.classList.toggle("open");
        if (arrow) arrow.innerText = next.classList.contains("show") ? "▼" : "▶";
    }
}

function loadAndClassifyCookies() {
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        const tab = tabs[0];
        const url = new URL(tab.url);
        const host = url.hostname;

        const handleWithHosts = (embeddedHosts = []) => {
            chrome.cookies.getAll({}, (cookies) => {
                const grouped = classifyCookies(cookies, [host]);
                allGroupedCookies = grouped;
                renderCookieTable();
                renderCurrentTabCookies(grouped, host, embeddedHosts);
            });
        };

        chrome.runtime.sendMessage({action: "getEmbeddedDomains", tabId: tab.id}, (response) => {
            if (chrome.runtime.lastError || !response || response.error) {
                console.warn("[COOKIE] embedded domains failed:", chrome.runtime.lastError || response?.error);
                handleWithHosts([]); // fallback
            } else {
                handleWithHosts(response.embeddedHosts || []);
            }
        });
    });
}



function domainMatches(cookieDomain, pageHost) {
    const clean = cookieDomain.replace(/^\./, "").toLowerCase();
    return clean === pageHost || pageHost.endsWith("." + clean) || clean.endsWith("." + pageHost);
}

function updateTabCounters() {
    const tabs = {essential: 0, analytics: 0, suspicious: 0, whitelist: 0};
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

function shorten(str, limit = 50) {
    if (!str || str.length <= limit) return str;
    return str.slice(0, limit) + '...';
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
            row.classList.add("expand-toggle", "table-active");
            if (isWhitelisted) {
                row.classList.add("table-success");
            } else if (group.thirdParty) {
                row.classList.add("table-warning");
            }

            const label = group.thirdParty ? `<div class="small text-muted">Third-party</div>` : "";

            row.innerHTML = `
                <td class="text-start" data-domain="${group.domain}">
                    <span class="arrow me-1 text-muted">▶</span><strong>${group.domain}</strong>
                    ${label}
                </td>
                <td class="text-center">${group.cookies.length}</td>
                <td class="text-center">
                    <div class="d-flex justify-content-center gap-1">
                        ${
                isWhitelisted
                    ? `<button class="btn btn-outline-danger btn-sm py-0 px-1 delete-btn" data-domain="${group.domain}" title="Delete all cookies">🗑</button>`
                    : `<button class="btn btn-outline-success btn-sm py-0 px-1 whitelist-btn" data-domain="${group.domain}" title="Add to whitelist">✅</button>
                                   <button class="btn btn-outline-danger btn-sm py-0 px-1 delete-btn" data-domain="${group.domain}" title="Delete all cookies">🗑</button>`
            }
                    </div>
                </td>`;
            mainTbody.appendChild(row);

            const detailRow = document.createElement("tr");
            detailRow.classList.add("collapse", "bg-white", "cookie-details");
            detailRow.dataset.domain = group.domain;

            detailRow.innerHTML = `
                <td colspan="3" class="pt-2 pb-2">
                    <table class="table table-sm table-borderless mb-0">
                        <tbody>
                            ${group.cookies.map(c => `
                                <tr>
                                    <td class="align-top small text-start text-break" style="width: 100%;">
                                        <strong>${c.domain}</strong> | Path: ${c.path}, Secure: ${c.secure}, HttpOnly: ${c.httpOnly}<br>
                                        <strong>${c.name}</strong> = <code class="text-danger">${shorten(c.value)}</code>
                                    </td>
                                    <td class="text-end align-top" style="white-space: nowrap;">
                                        ${
                isWhitelisted ? "" : `
                                                <button class="btn btn-outline-success btn-sm py-0 px-1 whitelist-single-btn" 
                                                        data-name="${c.name}" data-domain="${c.domain}" 
                                                        title="Add to whitelist">✅</button>
                                            `
            }
                                        <button class="btn btn-outline-danger btn-sm py-0 px-1 delete-single-btn" 
                                                data-name="${c.name}" data-domain="${c.domain}" 
                                                title="Delete this cookie">🗑</button>
                                    </td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </td>`;
            mainTbody.appendChild(detailRow);
        });
    });
}


function renderFilteredTable(cookieList) {
    log("Rendering filtered table, total domains:", cookieList.length);
    const tbody = document.getElementById("cookieTableBody");
    tbody.innerHTML = "";

    cookieList.forEach(cookie => {
        const tr = document.createElement("tr");
        tr.classList.add("expand-toggle", "table-active");

        const domainTd = document.createElement("td");
        domainTd.setAttribute("data-domain", cookie.domain);
        domainTd.className = "text-start";
        domainTd.innerHTML = `<span class="arrow me-1 text-muted">▶</span><strong>${cookie.domain}</strong>`;
        tr.appendChild(domainTd);

        const countTd = document.createElement("td");
        countTd.className = "text-center";
        countTd.textContent = cookie.count;
        tr.appendChild(countTd);

        const actionsTd = document.createElement("td");
        actionsTd.className = "text-center";
        const actionsSpan = document.createElement("span");
        actionsSpan.className = "d-flex gap-1 justify-content-center";

        if (currentType === "whitelist") {
            const removeBtn = document.createElement("button");
            removeBtn.className = "btn btn-outline-danger btn-sm py-0 px-1 remove-whitelist-btn";
            removeBtn.textContent = "↩️";
            removeBtn.title = "Remove from whitelist";
            removeBtn.dataset.domain = cookie.domain;
            actionsSpan.appendChild(removeBtn);
        } else {
            const whitelistBtn = document.createElement("button");
            whitelistBtn.className = "btn btn-outline-success btn-sm py-0 px-1 whitelist-btn";
            whitelistBtn.textContent = "✅";
            whitelistBtn.title = "Add to whitelist";
            whitelistBtn.dataset.domain = cookie.domain;
            actionsSpan.appendChild(whitelistBtn);

            const deleteBtn = document.createElement("button");
            deleteBtn.className = "btn btn-outline-danger btn-sm py-0 px-1 delete-btn";
            deleteBtn.textContent = "🗑";
            deleteBtn.title = "Delete all cookies";
            deleteBtn.dataset.domain = cookie.domain;
            actionsSpan.appendChild(deleteBtn);
        }

        actionsTd.appendChild(actionsSpan);
        tr.appendChild(actionsTd);

        tbody.appendChild(tr);

        // Детали (вложенная таблица)
        const detailTr = document.createElement("tr");
        detailTr.className = "collapse bg-white cookie-details";
        detailTr.dataset.domain = cookie.domain;

        const detailTd = document.createElement("td");
        detailTd.setAttribute("colspan", "3");
        detailTd.className = "pt-2 pb-2";

        detailTd.innerHTML = `
            <table class="table table-sm table-borderless mb-0">
                <tbody>
                    ${(cookie.cookies || []).map(c => `
                        <tr>
                            <td class="align-top small text-start text-break" style="width: 100%;">
                                <strong>${c.domain}</strong> | Path: ${c.path}, Secure: ${c.secure}, HttpOnly: ${c.httpOnly}<br>
                                <strong>${c.name}</strong> = <code class="text-danger">${shorten(c.value)}</code>
                            </td>
                            <td class="text-end align-top" style="white-space: nowrap;">
                                ${
            currentType === "whitelist"
                ? `<button class="btn btn-outline-danger btn-sm py-0 px-1 remove-whitelist-btn" 
                                                  data-name="${c.name}" data-domain="${c.domain}" 
                                                  title="Remove from whitelist">↩️</button>`
                : `
                                            <button class="btn btn-outline-success btn-sm py-0 px-1 whitelist-single-btn" 
                                                    data-name="${c.name}" data-domain="${c.domain}" 
                                                    title="Add to whitelist">✅</button>
                                            <button class="btn btn-outline-danger btn-sm py-0 px-1 delete-single-btn" 
                                                    data-name="${c.name}" data-domain="${c.domain}" 
                                                    title="Delete this cookie">🗑</button>
                                          `
        }
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>`;
        detailTr.appendChild(detailTd);
        tbody.appendChild(detailTr);
    });

    updateDeleteButton(cookieList);
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
    const btn = e.target;
    const domain = btn.dataset.domain;
    const name = btn.dataset.name;
    deleteCookie(domain, name); // 🔄 более универсально, с перерисовкой
}

function handleAddToWhitelist(e) {
    const btn = e.target;
    const domain = btn.dataset.domain;
    const name = btn.dataset.name;

    if (name) {
        addCookieToWhitelist(domain, name); // 🔄 только конкретную куку
    } else {
        addDomainToWhitelist(domain); // 🔄 весь домен
    }
}

function handleRemoveFromWhitelist(e) {
    const btn = e.target;
    const domain = btn.dataset.domain;
    const name = btn.dataset.name;

    if (name) {
        removeCookieFromWhitelist(domain, name); // ❌ только имя@домен
    } else {
        removeDomainFromWhitelist(domain); // ❌ весь домен
    }
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
                    count: 0,
                    name: "Multiple cookies",
                    type: c.type,
                    pathList: [],
                    cookies: []
                };
            }
            grouped[domain].count += c.count;
            grouped[domain].pathList.push(...(c.pathList || []));

// Генерируем поддельный список cookies вручную:
            grouped[domain].cookies.push({
                name: c.name || "cookie",
                value: c.value || "",
                domain: c.domain,
                path: (c.pathList || [])[0] || "/",
                secure: c.secure || false,
                httpOnly: c.httpOnly || false
            });


        });

        updateTabCounters();

        const tbody = document.getElementById("cookieTableBody");
        if (tbody) {
            tbody.innerHTML = "";
            renderFilteredTable(Object.values(grouped), tbody);
        }
    });
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

function addCookieToWhitelist(domain, name) {
    const cleanDomain = domain.replace(/^\./, "").toLowerCase();
    const key = `${name}@${cleanDomain}`;
    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const list = new Set(data.cookieWhitelist || []);
        list.add(key);
        chrome.storage.sync.set({cookieWhitelist: Array.from(list)}, () => {
            loadAndClassifyCookies();
        });
    });
}


function addDomainToWhitelist(domain) {
    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const list = new Set(data.cookieWhitelist || []);
        list.add(domain.toLowerCase());
        chrome.storage.sync.set({cookieWhitelist: Array.from(list)}, () => {
            loadAndClassifyCookies(); // ✅ заменить
        });
    });
}

function removeDomainFromWhitelist(domain) {
    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const list = new Set(data.cookieWhitelist || []);
        list.delete(domain.toLowerCase());
        chrome.storage.sync.set({cookieWhitelist: Array.from(list)}, () => {
            loadAndClassifyCookies(); // ✅ заменить
        });
    });
}

function removeCookieFromWhitelist(domain, name) {
    const cleanDomain = domain.replace(/^\./, "").toLowerCase();
    const key = `${name}@${cleanDomain}`;
    chrome.storage.sync.get(["cookieWhitelist"], (data) => {
        const list = new Set(data.cookieWhitelist || []);
        list.delete(key);
        chrome.storage.sync.set({cookieWhitelist: Array.from(list)}, () => {
            loadAndClassifyCookies();
        });
    });
}


function deleteCookiesByDomain(domain) {
    chrome.cookies.getAll({domain}, (cookies) => {
        cookies.forEach(cookie => {
            chrome.cookies.remove({
                url: (cookie.secure ? "https://" : "http://") + cookie.domain + cookie.path,
                name: cookie.name
            });
        });
        renderCookieTable();
    });
}

function deleteCookie(domain, name) {
    chrome.cookies.getAll({domain}, (cookies) => {
        cookies
            .filter(c => c.name === name)
            .forEach(cookie => {
                chrome.cookies.remove({
                    url: (cookie.secure ? "https://" : "http://") + cookie.domain + cookie.path,
                    name: cookie.name
                });
            });
        renderCookieTable();
    });
}

function isWhitelisted(domain, name = null, whitelist = []) {
    const normalize = str => str.replace(/^\./, "").toLowerCase();
    const keys = new Set((whitelist || []).map(w => normalize(w)));
    if (name) {
        return keys.has(normalize(`${name}@${domain}`));
    }
    return keys.has(normalize(domain));
}


window.addEventListener("load", () => {
    const cookieTabBtn = document.getElementById("nav-cookie-tab");
    console.log("[COOKIE] waiting for tab element:", cookieTabBtn);
    if (!cookieTabBtn) return;

    cookieTabBtn.addEventListener("shown.bs.tab", () => {
        console.log("[COOKIE] tab opened — triggering load");
        const cookieBody = document.getElementById("cookieTableBody");
        if (cookieBody && cookieBody.innerHTML.includes("Loading")) {
            window.loadCookieTab?.();
        }
    });
});




