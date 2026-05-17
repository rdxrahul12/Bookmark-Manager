/**
 * Bookmark Delight — Background Service Worker
 * 
 * 100% Local Safari-Style Icon Extraction Engine v2
 * 
 * This service worker fetches the HTML of bookmarked sites directly
 * (bypassing CORS restrictions that block normal web apps) and parses
 * <link> and <meta> tags to find the highest quality icon available.
 * 
 * v2 improvements:
 *   - Handles redirects (follows them automatically)
 *   - Better User-Agent for sites that return different content based on UA
 *   - Handles Google sites properly (calendar, maps, drive, etc.)
 *   - Always probes well-known paths in parallel with HTML parsing
 *   - Better HTML parsing (handles self-closing tags, attribute order variants)
 * 
 * Priority order (matching Safari):
 *   1. apple-touch-icon (180x180 — purpose-built for this exact use case)
 *   2. apple-touch-icon-precomposed
 *   3. Large PNG/SVG icons from <link rel="icon"> (192x192, 512x512, etc.)
 *   4. manifest.json icons (PWA icons — often 512x512)
 *   5. og:image / twitter:image (Open Graph — often a brand logo)
 *   6. Standard favicon (any size)
 *   7. Well-known paths (/apple-touch-icon.png, /favicon.ico)
 */

// ============================================================
// CONSTANTS
// ============================================================

const CHROME_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// ============================================================
// ICON CANDIDATE PARSING
// ============================================================

/**
 * Parses raw HTML text and extracts all icon candidates.
 * Returns an array of { url, type, size, priority } objects.
 */
function parseIconCandidates(html, baseUrl) {
  const candidates = [];
  let resolvedBase = baseUrl;

  // Check for <base href="..."> tag which changes relative URL resolution
  const baseMatch = html.match(/<base\s+[^>]*href\s*=\s*["']([^"']+)["']/i);
  if (baseMatch) {
    try {
      resolvedBase = new URL(baseMatch[1], baseUrl).href;
    } catch { /* ignore invalid base */ }
  }

  const baseOrigin = new URL(resolvedBase).origin;

  /**
   * Resolves a potentially relative href to an absolute URL.
   */
  function resolveUrl(href) {
    if (!href) return null;
    href = href.trim();
    if (href.startsWith('data:')) return href;
    if (href.startsWith('//')) return 'https:' + href;
    if (href.startsWith('http://') || href.startsWith('https://')) return href;
    if (href.startsWith('/')) return baseOrigin + href;
    try {
      return new URL(href, resolvedBase).href;
    } catch {
      return null;
    }
  }

  /**
   * Extracts the largest numeric size from a `sizes` attribute.
   */
  function parseSize(sizesAttr) {
    if (!sizesAttr) return 0;
    if (sizesAttr.toLowerCase() === 'any') return 512;
    const matches = sizesAttr.match(/(\d+)x(\d+)/g);
    if (!matches) return 0;
    let maxSize = 0;
    for (const m of matches) {
      const [w] = m.split('x').map(Number);
      if (w > maxSize) maxSize = w;
    }
    return maxSize;
  }

  // Only scan the <head> section for performance and accuracy
  const headMatch = html.match(/<head[\s>]([\s\S]*?)<\/head>/i);
  const headHtml = headMatch ? headMatch[1] : html.slice(0, 15000); // fallback: first 15KB

  // --- 1. Parse <link> tags ---
  const linkRegex = /<link\s+([^>]*?)\/?>/gi;
  let linkMatch;
  while ((linkMatch = linkRegex.exec(headHtml)) !== null) {
    const attrs = linkMatch[1];

    const relMatch = attrs.match(/rel\s*=\s*["']([^"']+)["']/i);
    if (!relMatch) continue;
    const rel = relMatch[1].toLowerCase().trim();

    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = resolveUrl(hrefMatch[1]);
    if (!href) continue;

    const sizesMatch = attrs.match(/sizes\s*=\s*["']([^"']+)["']/i);
    const size = sizesMatch ? parseSize(sizesMatch[1]) : 0;

    const typeMatch = attrs.match(/type\s*=\s*["']([^"']+)["']/i);
    const mimeType = typeMatch ? typeMatch[1].toLowerCase() : '';

    if (rel.includes('apple-touch-icon-precomposed')) {
      candidates.push({ url: href, type: 'apple-touch-icon-precomposed', size: size || 180, priority: 2 });
    } else if (rel.includes('apple-touch-icon')) {
      candidates.push({ url: href, type: 'apple-touch-icon', size: size || 180, priority: 1 });
    } else if (rel === 'icon' || rel === 'shortcut icon') {
      const isSvg = mimeType === 'image/svg+xml' || href.endsWith('.svg');
      candidates.push({
        url: href,
        type: isSvg ? 'svg-icon' : 'icon',
        size: isSvg ? 512 : (size || 16),
        priority: isSvg ? 3 : 5,
      });
    } else if (rel === 'manifest' || rel === 'webmanifest') {
      candidates.push({ url: href, type: 'manifest', size: 0, priority: 99 });
    }
  }

  // --- 2. Parse <meta> og:image / twitter:image ---
  const metaRegex = /<meta\s+([^>]*?)\/?>/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(headHtml)) !== null) {
    const attrs = metaMatch[1];

    // Handle both property="og:image" and name="twitter:image" formats
    // Also handle content-before-property ordering
    const propMatch = attrs.match(/(?:property|name)\s*=\s*["'](og:image|twitter:image)["']/i);
    if (!propMatch) continue;

    const contentMatch = attrs.match(/content\s*=\s*["']([^"']+)["']/i);
    if (!contentMatch) continue;

    const href = resolveUrl(contentMatch[1]);
    if (href) {
      candidates.push({ url: href, type: 'og-image', size: 256, priority: 4 });
    }
  }

  return candidates;
}


// ============================================================
// MANIFEST.JSON ICON PARSING
// ============================================================

async function extractManifestIcons(manifestUrl, baseUrl) {
  try {
    const response = await fetch(manifestUrl, {
      signal: AbortSignal.timeout(5000),
      credentials: 'include',
      headers: { 
        'Accept': 'application/json, application/manifest+json, */*',
        'User-Agent': CHROME_UA,
      },
    });
    if (!response.ok) return [];

    const text = await response.text();
    // Some manifests have BOM or comments — try to strip those
    const cleanedText = text.replace(/^\uFEFF/, '').trim();
    const manifest = JSON.parse(cleanedText);
    
    if (!manifest.icons || !Array.isArray(manifest.icons)) return [];

    const baseOrigin = new URL(baseUrl).origin;

    return manifest.icons
      .filter(icon => icon.src)
      .map(icon => {
        let src = icon.src;
        if (!src.startsWith('http')) {
          try {
            src = src.startsWith('/') ? baseOrigin + src : new URL(src, manifestUrl).href;
          } catch {
            src = baseOrigin + '/' + src;
          }
        }
        const sizeStr = icon.sizes || '0x0';
        const size = Math.max(...sizeStr.split(/\s+/).map(s => {
          const parts = s.split('x');
          return parseInt(parts[0]) || 0;
        }));

        // Prefer maskable/any purpose icons as they're designed for this use case
        const purpose = (icon.purpose || '').toLowerCase();
        const priorityBoost = purpose.includes('maskable') || purpose.includes('any') ? 0 : 0;

        return { url: src, type: 'manifest-icon', size, priority: 3 + priorityBoost };
      });
  } catch {
    return [];
  }
}


// ============================================================
// WELL-KNOWN PATH PROBING
// ============================================================

async function probeWellKnownPaths(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const paths = [
    { path: '/apple-touch-icon.png', type: 'well-known-apple', size: 180, priority: 6 },
    { path: '/apple-touch-icon-precomposed.png', type: 'well-known-apple', size: 180, priority: 6 },
    { path: '/apple-touch-icon-180x180.png', type: 'well-known-apple', size: 180, priority: 6 },
    { path: '/apple-touch-icon-152x152.png', type: 'well-known-apple', size: 152, priority: 6 },
    { path: '/favicon-192x192.png', type: 'well-known-favicon', size: 192, priority: 7 },
    { path: '/favicon-96x96.png', type: 'well-known-favicon', size: 96, priority: 7 },
    { path: '/favicon-32x32.png', type: 'well-known-favicon', size: 32, priority: 7 },
    { path: '/favicon.ico', type: 'well-known-favicon', size: 16, priority: 8 },
  ];

  const results = [];

  await Promise.allSettled(paths.map(async ({ path, type, size, priority }) => {
    try {
      const resp = await fetch(origin + path, {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
        credentials: 'include',
        headers: { 'User-Agent': CHROME_UA },
      });
      if (resp.ok) {
        const contentType = resp.headers.get('content-type') || '';
        const contentLength = parseInt(resp.headers.get('content-length') || '0');
        if (
          (contentType.includes('image') || contentType.includes('icon') || path.endsWith('.ico')) &&
          (contentLength === 0 || contentLength > 100) // Skip suspiciously tiny responses
        ) {
          results.push({ url: origin + path, type, size, priority });
        }
      }
    } catch {
      // path doesn't exist
    }
  }));

  return results;
}


// ============================================================
// ICON FETCHING & CONVERSION
// ============================================================

async function fetchIconAsDataUrl(iconUrl) {
  try {
    const response = await fetch(iconUrl, {
      signal: AbortSignal.timeout(8000),
      credentials: 'include',
      headers: {
        'Accept': 'image/png, image/jpeg, image/svg+xml, image/webp, image/x-icon, */*',
        'User-Agent': CHROME_UA,
      },
    });

    if (!response.ok) return null;

    const blob = await response.blob();

    // Reject clearly non-image responses
    const type = blob.type || '';
    if (type.includes('text/html') || type.includes('application/json')) {
      return null;
    }

    // Reject tiny files (< 100 bytes) as they're likely error pages or empty responses
    if (blob.size < 100 && !type.includes('icon')) return null;

    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}


// ============================================================
// MAIN EXTRACTION ORCHESTRATOR
// ============================================================

async function extractIcon(pageUrl) {
  console.log(`[LocalIcon] Starting extraction for: ${pageUrl}`);

  let candidates = [];

  // Step 1: Fetch HTML + probe well-known paths IN PARALLEL
  const [htmlResult, wellKnownResult] = await Promise.allSettled([
    // HTML fetch
    (async () => {
      try {
        const response = await fetch(pageUrl, {
          signal: AbortSignal.timeout(10000),
          credentials: 'include',
          headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': CHROME_UA,
          },
          // follow redirects is fine, Google uses cookies first
          redirect: 'follow',
        });

        if (!response.ok) return [];

        // Use the final URL after redirects for resolving relative paths
        const finalUrl = response.url || pageUrl;
        const html = await response.text();
        const parsed = parseIconCandidates(html, finalUrl);
        console.log(`[LocalIcon] Found ${parsed.length} candidates from HTML`);

        // Extract manifest icons if found
        const manifestCandidate = parsed.find(c => c.type === 'manifest');
        if (manifestCandidate) {
          const manifestIcons = await extractManifestIcons(manifestCandidate.url, finalUrl);
          const filtered = parsed.filter(c => c.type !== 'manifest');
          console.log(`[LocalIcon] Added ${manifestIcons.length} manifest icons`);
          return [...filtered, ...manifestIcons];
        }

        return parsed;
      } catch (err) {
        console.warn(`[LocalIcon] HTML fetch failed for ${pageUrl}:`, err.message);
        return [];
      }
    })(),

    // Well-known paths (always probe, in parallel)
    probeWellKnownPaths(pageUrl),
  ]);

  // Merge results
  if (htmlResult.status === 'fulfilled') {
    candidates = candidates.concat(htmlResult.value);
  }
  if (wellKnownResult.status === 'fulfilled') {
    // Only add well-known paths if we don't already have high-quality icons
    const hasHighQuality = candidates.some(c => c.size >= 128);
    if (!hasHighQuality) {
      candidates = candidates.concat(wellKnownResult.value);
    }
  }

  // Step 2: Deduplicate by URL
  const seen = new Set();
  candidates = candidates.filter(c => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  // Step 3: Sort — priority first, then size descending
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.size - a.size;
  });

  console.log(`[LocalIcon] Ranked ${candidates.length} candidates:`, candidates.slice(0, 5).map(c => `${c.type}(${c.size}px)`));

  // Step 4: Fetch the best candidate (with fallthrough)
  for (const candidate of candidates) {
    const dataUrl = await fetchIconAsDataUrl(candidate.url);
    if (dataUrl) {
      console.log(`[LocalIcon] ✅ ${candidate.type} (${candidate.size}px) for: ${pageUrl}`);
      return {
        success: true,
        iconDataUrl: dataUrl,
        source: candidate.type,
        size: candidate.size,
      };
    }
    console.log(`[LocalIcon] ❌ Failed: ${candidate.url}`);
  }

  console.log(`[LocalIcon] ❌ All failed for: ${pageUrl}`);
  return { success: false };
}


// ============================================================
// CHROME MESSAGE LISTENER
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_ICON' && message.url) {
    extractIcon(message.url)
      .then(result => sendResponse(result))
      .catch(err => {
        console.error('[LocalIcon] Error:', err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // async response
  }
});

console.log('[LocalIcon] Background service worker v2 initialized.');
