/**
 * Extracts the full hostname from a URL (strips www.)
 */
export const getDomain = (url: string): string => {
    try {
        const domain = new URL(url).hostname;
        return domain.startsWith("www.") ? domain.slice(4) : domain;
    } catch {
        return "";
    }
};

/**
 * Generates a deterministic color based on a string (domain)
 */
export const getColorForDomain = (domain: string): string => {
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
        hash = domain.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    const s = 70 + (Math.abs(hash) % 15);
    const l = 50 + (Math.abs(hash) % 10);
    return `hsl(${h}, ${s}%, ${l}%)`;
};

/**
 * Constructs favicon URLs for different providers.
 * Each provider returns different quality/coverage.
 */
export type FaviconProvider = 'google' | 'ddg' | 'iconhorse' | 'clearbit';

export const getFaviconUrl = (url: string, provider: FaviconProvider = 'google'): string => {
    const domain = getDomain(url);
    if (!domain) return "";

    switch (provider) {
        case 'google':
            // Google returns 128x128 max, but often generic for subdomains
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

        case 'ddg':
            // DuckDuckGo — decent quality, good coverage
            return `https://icons.duckduckgo.com/ip3/${domain}.ico`;

        case 'iconhorse':
            // icon.horse — purpose-built for high-quality favicon extraction
            // It does the same HTML parsing we do, but as a cloud service
            return `https://icon.horse/icon/${domain}`;

        case 'clearbit':
            // Clearbit Logo API — returns clean, high-res company logos
            // Great for major brands, returns nothing for small sites
            return `https://logo.clearbit.com/${domain}`;

        default:
            return "";
    }
};

/**
 * Curated high-quality icon URLs for major services where
 * automated extraction fails (e.g. Google services redirect to login).
 * 
 * These are the actual apple-touch-icon or high-res icon URLs
 * that these services serve to browsers with cookies/auth.
 */
export const CURATED_ICONS: Record<string, string> = {
    // Google Services — mapped to standard reliable domains via Google's favicon service
    'calendar.google.com':      'https://www.google.com/s2/favicons?domain=calendar.google.com&sz=128',
    'mail.google.com':          'https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico', // Gmail works perfectly
    'drive.google.com':         'https://www.google.com/s2/favicons?domain=drive.google.com&sz=128',
    'docs.google.com':          'https://www.google.com/s2/favicons?domain=docs.google.com&sz=128',
    'sheets.google.com':        'https://www.google.com/s2/favicons?domain=sheets.google.com&sz=128',
    'slides.google.com':        'https://www.google.com/s2/favicons?domain=slides.google.com&sz=128',
    'maps.google.com':          'https://www.google.com/s2/favicons?domain=maps.google.com&sz=128',
    'meet.google.com':          'https://www.google.com/s2/favicons?domain=meet.google.com&sz=128',
    'photos.google.com':        'https://www.google.com/s2/favicons?domain=photos.google.com&sz=128',
    'translate.google.com':     'https://www.google.com/s2/favicons?domain=translate.google.com&sz=128',
    'keep.google.com':          'https://www.google.com/s2/favicons?domain=keep.google.com&sz=128',
    'news.google.com':          'https://www.google.com/s2/favicons?domain=news.google.com&sz=128',
    'play.google.com':          'https://www.google.com/s2/favicons?domain=play.google.com&sz=128',
    
    // YouTube reliably returns icons via main domain
    'youtube.com':              'https://logo.clearbit.com/youtube.com',
    'www.youtube.com':          'https://logo.clearbit.com/youtube.com',
    'music.youtube.com':        'https://logo.clearbit.com/youtube.com',
    'studio.youtube.com':       'https://logo.clearbit.com/youtube.com',

    // Microsoft Services
    'outlook.live.com':         'https://res.cdn.office.net/assets/mail/pwa/v1/pngs/msft_outlook_icon192.png',
    'outlook.office.com':       'https://res.cdn.office.net/assets/mail/pwa/v1/pngs/msft_outlook_icon192.png',
    'teams.microsoft.com':      'https://statics.teams.cdn.office.net/hashedassets/favicon/teams-favicon-fluent-192x192.png',
    'onedrive.live.com':        'https://p.sfx.ms/images/favicon/onedrive.ico',

    // Other major services that often have extraction issues
    'chat.openai.com':          'https://cdn.oaistatic.com/assets/apple-touch-icon-mz9nytnj.png',
    'chatgpt.com':              'https://cdn.oaistatic.com/assets/apple-touch-icon-mz9nytnj.png',
    'notion.so':                'https://www.notion.so/images/favicon.ico',
    'figma.com':                'https://static.figma.com/app/icon/1/favicon.png',
    'www.figma.com':            'https://static.figma.com/app/icon/1/favicon.png',
    'linear.app':               'https://linear.app/apple-touch-icon.png',
    'vercel.com':               'https://assets.vercel.com/image/upload/front/favicon/vercel/180x180.png',
    'netlify.com':              'https://www.netlify.com/v3/static/favicon/apple-touch-icon.png',
};

/**
 * Checks if a domain has a curated high-quality icon URL.
 */
export const getCuratedIconUrl = (url: string): string | null => {
    const domain = getDomain(url);
    return CURATED_ICONS[domain] || null;
};
