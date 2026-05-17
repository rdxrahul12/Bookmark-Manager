/**
 * Local Icon Extractor — Chrome Extension Messaging Bridge
 * 
 * Communicates with the background service worker to extract
 * high-quality icons from bookmarked sites, 100% locally.
 * 
 * Gracefully falls back to null when chrome.runtime is unavailable
 * (e.g. in dev mode or non-extension contexts).
 */

interface ExtractIconResponse {
    success: boolean;
    iconDataUrl?: string;
    source?: string;
    size?: number;
    error?: string;
}

/**
 * Checks if the Chrome Extension runtime is available.
 */
function isChromeExtension(): boolean {
    return (
        typeof chrome !== 'undefined' &&
        typeof chrome.runtime !== 'undefined' &&
        typeof chrome.runtime.sendMessage === 'function' &&
        !!chrome.runtime.id
    );
}

/**
 * Extracts the best icon for a given URL using the background service worker.
 * 
 * Returns a base64 data URL string on success, or null if:
 * - Not running as a Chrome extension
 * - The background script fails to extract an icon
 * - The request times out
 */
export async function extractLocalIcon(url: string): Promise<string | null> {
    if (!isChromeExtension()) {
        console.log('[LocalIcon] Chrome extension runtime not available, skipping local extraction.');
        return null;
    }

    try {
        const response = await new Promise<ExtractIconResponse>((resolve, reject) => {
            // Timeout after 12 seconds to prevent hanging
            const timeout = setTimeout(() => {
                reject(new Error('Local icon extraction timed out'));
            }, 12000);

            chrome.runtime.sendMessage(
                { type: 'EXTRACT_ICON', url },
                (response: ExtractIconResponse) => {
                    clearTimeout(timeout);

                    // Check for Chrome runtime errors
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }

                    resolve(response);
                }
            );
        });

        if (response?.success && response.iconDataUrl) {
            console.log(`[LocalIcon] Extracted ${response.source} (${response.size}px) for: ${url}`);
            return response.iconDataUrl;
        }

        console.log(`[LocalIcon] No icon extracted for: ${url}`);
        return null;
    } catch (err) {
        console.warn('[LocalIcon] Extraction failed:', (err as Error).message);
        return null;
    }
}
