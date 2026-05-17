import { getFaviconUrl, getDomain, getCuratedIconUrl } from "./faviconUtils";
import { extractLocalIcon } from "./localIconExtractor";

interface IconCandidate {
    source: 'curated' | 'local' | 'iconhorse' | 'clearbit' | 'google' | 'ddg';
    url: string;
    width: number;
    height: number;
    isDataUrl?: boolean;
}

/**
 * Loads an image to determine its natural dimensions.
 * Returns null if the image fails to load.
 */
const probeImage = (url: string, source: IconCandidate['source'], timeoutMs = 6000): Promise<IconCandidate | null> => {
    return new Promise((resolve) => {
        const img = new Image();
        const timer = setTimeout(() => {
            img.src = '';
            resolve(null);
        }, timeoutMs);

        img.onload = () => {
            clearTimeout(timer);
            resolve({
                source,
                url,
                width: img.naturalWidth,
                height: img.naturalHeight,
            });
        };
        img.onerror = () => {
            clearTimeout(timer);
            resolve(null);
        };
        img.crossOrigin = 'anonymous';
        img.src = url;
    });
};

/**
 * Robust multi-source icon extraction engine.
 * 
 * Extraction priority:
 *   0. CURATED — hardcoded high-quality URLs for major services (Google, MS, etc.)
 *   1. LOCAL   — Chrome extension background worker (Safari-style HTML parsing)
 *   2. icon.horse — cloud service that does the same HTML parsing
 *   3. Clearbit — high-res company logos
 *   4. Google Favicons API
 *   5. DuckDuckGo Icons
 * 
 * Design: Curated icons are checked FIRST (instant, guaranteed quality).
 * Then local extraction is attempted.
 * If both fail, we race 4 external APIs in parallel and pick the best.
 */
export const findBestFavicon = async (pageUrl: string): Promise<IconCandidate | null> => {
    const domain = getDomain(pageUrl);
    if (!domain) return null;

    // =============================
    // TIER 0: Curated Icon Database
    // =============================
    // For Google Calendar, Maps, YouTube, etc. where automated extraction
    // always fails because they redirect to login pages.
    const curatedUrl = getCuratedIconUrl(pageUrl);
    if (curatedUrl) {
        const curated = await probeImage(curatedUrl, 'curated', 4000);
        if (curated && curated.width >= 16) {
            console.log(`[IconRanker] ✅ Curated icon for ${domain}: ${curated.width}x${curated.height}`);
            return curated;
        }
        // If curated icon fails to load, fall through to other methods
        console.warn(`[IconRanker] Curated icon failed for ${domain}, falling through...`);
    }

    // =============================
    // TIER 1: Local Extraction (Extension only)
    // =============================
    try {
        const localDataUrl = await extractLocalIcon(pageUrl);
        if (localDataUrl) {
            const localCandidate = await probeImage(localDataUrl, 'local');
            if (localCandidate && localCandidate.width >= 32) {
                console.log(`[IconRanker] ✅ Local icon for ${domain}: ${localCandidate.width}x${localCandidate.height}`);
                return { ...localCandidate, isDataUrl: true };
            }
        }
    } catch (err) {
        console.warn(`[IconRanker] Local extraction failed for ${domain}:`, err);
    }

    // =============================
    // TIER 2: Race All External APIs
    // =============================
    // Fire all 4 sources in parallel, pick the best result
    const candidates = await Promise.all([
        probeImage(getFaviconUrl(pageUrl, 'iconhorse'), 'iconhorse', 5000),
        probeImage(getFaviconUrl(pageUrl, 'clearbit'), 'clearbit', 5000),
        probeImage(getFaviconUrl(pageUrl, 'google'), 'google', 5000),
        probeImage(getFaviconUrl(pageUrl, 'ddg'), 'ddg', 5000),
    ]);

    // Filter valid results (must be at least 16x16)
    const validIcons = candidates.filter((icon): icon is IconCandidate => {
        if (!icon) return false;
        if (icon.width < 16) return false;
        return true;
    });

    if (validIcons.length === 0) {
        console.log(`[IconRanker] ❌ No valid icons found for ${domain}`);
        return null;
    }

    // Score each icon: bigger = better, with source-based tiebreaking
    const SOURCE_PRIORITY: Record<string, number> = {
        iconhorse: 1,
        clearbit: 2,
        google: 3,
        ddg: 4,
    };

    validIcons.sort((a, b) => {
        // Primary: largest icon wins
        const sizeA = Math.max(a.width, a.height);
        const sizeB = Math.max(b.width, b.height);
        if (sizeB !== sizeA) return sizeB - sizeA;

        // Secondary: prefer icon.horse > clearbit > google > ddg
        return (SOURCE_PRIORITY[a.source] || 99) - (SOURCE_PRIORITY[b.source] || 99);
    });

    const winner = validIcons[0];
    console.log(`[IconRanker] ✅ ${winner.source} for ${domain}: ${winner.width}x${winner.height} (${validIcons.length} sources responded)`);
    return winner;
};
