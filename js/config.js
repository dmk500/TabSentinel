export const DEFAULT_CONFIG = {
    DEFAULT_SUSPEND_TIME: 60 * 60000,       // 60 minutes
    MIN_SUSPEND_TIME_MINUTES: 1,            // min 5 minutes
    MAX_SUSPEND_TIME_MINUTES: 1440,         // max 24 minutes
    DEFAULT_EXTENSION_ENABLED_KEY: "extensionEnabled",
    DEFAULT_EXCLUDED_SITES: [
        "mail.google.com",
        "calendar.google.com",
        "google.com",
        "www.youtube.com",
        "spotify.com",
        "netflix.com",
        "zoom.us",
        "chatgpt.com"
    ],
    DISALLOWED_PROTOCOLS: [
        "chrome:",
        "chrome-extension:",
        "edge:",
        "about:",
        "file:"
    ],
    ENABLE_SLEEP_LOGS: 0,     // 🔧 Suspender logs
    ENABLE_COOKIE_LOGS: 0,    // 🔧 Cookie logs
    // ENABLE_POPUP_BLOCKER_LOGS: 1     // 🔧 Popup blocker logs
};
