// cookieClassifier.js
// Classifies cookies into essential, analytics, or suspicious types

// Known trusted domains (used for login, accounts, communication, etc.)
const essentialDomains = [
    "paypal.com", "stripe.com", "visa.com", "mastercard.com", "americanexpress.com",
    "microsoft.com", "live.com", "outlook.com", "azure.com",
    "google.com", "accounts.google.com", "apple.com", "icloud.com", "amazon.com",
    "slack.com", "zoom.us", "skype.com", "webex.com",
    "asana.com", "trello.com", "notion.so", "evernote.com",
    "github.com", "gitlab.com", "stackoverflow.com", "chat.openai.com", "coursera.org",
    "mail.yandex.ru", "passport.yandex.ru", "auth.yandex.ru"
];

// Subdomain prefixes considered essential (used for login, auth, mail)
const essentialSubdomainPrefixes = ["mail.", "auth.", "passport."];

// Known analytics/tracking domains
const analyticsDomains = [
    // Global platforms
    "google-analytics.com", "googletagmanager.com", "doubleclick.net", "facebook.net",
    "mixpanel.com", "segment.io", "hotjar.com", "amplitude.com", "clarity.ms",
    "matomo.org", "piwik.pro", "adobe.com", "omniture.com", "snowplowanalytics.com",
    "heap.io", "kissmetrics.com", "crazyegg.com", "quantserve.com", "statcounter.com",
    "clicky.com", "chartbeat.com", "newrelic.com", "optimizely.com", "fullstory.com",
    "analytics.yahoo.com",

  // Russian
  "metrika.yandex.ru", "mc.yandex.ru", "yastatic.net", "cdn.metrika.yandex.ru",
  "openstat.net", "spylog.com", "liveinternet.ru", "top.mail.ru", "rambler.ru",

    // Chinese platforms
    "baidu.com", "cnzz.com", "umeng.com",

    // French platforms
    "atinternet.com",

    // German platforms
    "etracker.com",

    // Japanese platforms
    "userlocal.jp",

    // Brazilian platforms
    "clicky.com.br",

    // Indian platforms
    "tataconsumer.com",

    // Korean platforms
    "naver.com",

    // Turkish platforms
    "gemius.com.tr"
];

// Suspicious name patterns (for adtech, trackers, analytics)
const suspiciousKeywords = [
    "track", "trk", "ad", "ads", "pixel", "bid", "stat", "analytics", "click", "impression"
];

/**
 * Groups and classifies cookies by domain, name, and type
 * @param {Array} cookies - Raw cookies from chrome.cookies.getAll()
 * @param {Array} firstPartyHosts - Array of trusted hostnames (like current tab domain)
 * @returns {Array} - List of grouped and classified cookies
 */
export function classifyCookies(cookies, firstPartyHosts = []) {
    const grouped = {};

    cookies.forEach(cookie => {
        const key = `${cookie.name}@${cookie.domain}`;
        if (!grouped[key]) {
            grouped[key] = {
                name: cookie.name,
                domain: cookie.domain.replace(/^\./, "").toLowerCase(),
                count: 1,
                type: "essential", // default type
                pathList: [cookie.path]
            };
        } else {
            grouped[key].count++;
            grouped[key].pathList.push(cookie.path);
        }
    });

    Object.values(grouped).forEach(entry => {
        const domain = entry.domain;
        const name = entry.name.toLowerCase();

        // 1. Essential by subdomain
        if (essentialSubdomainPrefixes.some(prefix => domain.startsWith(prefix))) {
            entry.type = "essential";
            return;
        }

        // 2. Essential by trusted domains
        if (essentialDomains.some(trusted => domain.endsWith(trusted))) {
            entry.type = "essential";
            return;
        }

        // 3. Analytics by known domains
        if (analyticsDomains.some(analytic =>
            domain === analytic || domain.endsWith("." + analytic)
        )) {
            entry.type = "analytics";
            return;
        }

        // 4. Suspicious by name pattern
        if (suspiciousKeywords.some(keyword => name.includes(keyword))) {
            entry.type = "suspicious";
            return;
        }

        // 5. Third-party fallback
        const isThirdParty = !firstPartyHosts.some(host => domain.endsWith(host));
        if (isThirdParty) {
            entry.type = "suspicious";
        }
    });

    return Object.values(grouped);
}
