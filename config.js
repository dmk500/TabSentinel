export const DEFAULT_CONFIG = {
    DEFAULT_SUSPEND_TIME: 60 * 60000,       // 60 minutes
    MIN_SUSPEND_TIME_MINUTES: 1,            // min 5 minutes
    MAX_SUSPEND_TIME_MINUTES: 1440,         // max 24 minutes
    DEFAULT_EXTENSION_ENABLED_KEY: "extensionEnabled",
    DEFAULT_EXCLUDED_SITES: [
        "mail.google.com",
        "calendar.google.com",
        "google.com",
        "youtube.com",
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
    ]

};
