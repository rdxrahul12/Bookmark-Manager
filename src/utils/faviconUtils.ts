/**
 * Extracts the domain from a URL
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
 * Returns a hex color code
 */
export const getColorForDomain = (domain: string): string => {
    let hash = 0;
    for (let i = 0; i < domain.length; i++) {
        hash = domain.charCodeAt(i) + ((hash << 5) - hash);
    }

    // Use HSL for better color distribution
    // Hue: 0-360 based on hash
    // Saturation: 65-80% for vibrancy
    // Lightness: 45-60% for readability with white text
    const h = Math.abs(hash % 360);
    const s = 70 + (Math.abs(hash) % 15);
    const l = 50 + (Math.abs(hash) % 10);

    return `hsl(${h}, ${s}%, ${l}%)`;
};

/**
 * Constructs favicon URLs for different providers
 */
export const getFaviconUrl = (url: string, provider: 'google' | 'ddg' = 'google'): string => {
    const domain = getDomain(url);
    if (!domain) return "";

    switch (provider) {
        case 'google':
            return `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

        case 'ddg':
            return `https://icons.duckduckgo.com/ip3/${domain}.ico`;

        default:
            return "";
    }
};
