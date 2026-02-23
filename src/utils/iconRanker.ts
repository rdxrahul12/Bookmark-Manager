import { getFaviconUrl, getDomain } from "./faviconUtils";

interface IconCandidate {
    source: 'google' | 'ddg';
    url: string;
    width: number;
    height: number;
}

/**
 * Loads an image to determine its dimensions.
 */
const probeImage = (url: string, source: IconCandidate['source']): Promise<IconCandidate | null> => {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            resolve({
                source,
                url,
                width: img.naturalWidth,
                height: img.naturalHeight,
            });
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
};

/**
 * Races multiple favicon sources to find the highest quality one.
 * Filters out small/generic icons.
 */
export const findBestFavicon = async (pageUrl: string): Promise<IconCandidate | null> => {
    const domain = getDomain(pageUrl);
    if (!domain) return null;

    const candidates: Promise<IconCandidate | null>[] = [
        // 1. Google (High Res)
        probeImage(getFaviconUrl(pageUrl, 'google'), 'google'),

        // 2. DuckDuckGo (Backup)
        probeImage(getFaviconUrl(pageUrl, 'ddg'), 'ddg'),
    ];

    const results = await Promise.all(candidates);

    // Filter valid results
    const validIcons = results.filter((icon): icon is IconCandidate => {
        if (!icon) return false;

        // Ignore small icons (likely generic fallbacks)
        // Google's generic globe is 16x16. 
        // We want at least 32x32 to look decent.
        if (icon.width <= 16) return false;

        return true;
    });

    if (validIcons.length === 0) return null;

    // Sort by Size (Descending) -> Then by Priority (Google first)
    validIcons.sort((a, b) => {
        if (b.width !== a.width) return b.width - a.width;
        // If sizes are equal, prefer Google
        if (a.source === 'google') return -1;
        if (b.source === 'google') return 1;
        return 0;
    });

    return validIcons[0]; // The Winner
};
