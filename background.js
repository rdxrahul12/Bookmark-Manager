/**
 * Bookmark Manager — Background Service Worker
 *
 * Two icon-extraction strategies, exposed to the extension UI via
 * chrome.runtime messages:
 *
 *   1. EXTRACT_ICON  (fast)   — Static fetch + HTML parse + well-known
 *                                paths. Works for ~80% of public sites.
 *
 *   2. EXTRACT_ICON_DEEP (heavy, reliable) — Opens the URL in a hidden
 *                                background tab, lets the page execute
 *                                JavaScript with the user's cookies,
 *                                injects a content script via
 *                                chrome.scripting.executeScript, reads
 *                                the live DOM's `<link rel="icon">` and
 *                                manifest.json declarations, downloads
 *                                the highest-quality candidate, then
 *                                closes the tab. The user never sees any
 *                                of it.
 *
 * Why DEEP works where everything else fails:
 *   • Hidden tab loads with credentials, so authenticated icons resolve
 *     (Workday, Coupa, Salesforce-served apps).
 *   • JavaScript executes, so SPA-injected `<link>` tags appear in the
 *     DOM (modern Google products mutate the head client-side).
 *   • DOM is read post-render, so we capture exactly what Chrome itself
 *     shows in the tab strip.
 *   • Cross-Origin Resource Sharing is irrelevant — the extension has
 *     host permission for <all_urls>.
 *
 * Cost: a hidden tab takes ~3-8 seconds to load, settle, and close. This
 * runs once per bookmark host, in the background, and the result is
 * persisted as a `data:` URL forever.
 */

// ============================================================
// CONSTANTS
// ============================================================

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

// How long to wait for a hidden tab to settle before reading its DOM.
// 3.5s catches SPA bootstraps without keeping users waiting forever.
const TAB_SETTLE_MS = 3500;
// Hard ceiling — if the page is still loading after this long, give up.
const TAB_LOAD_TIMEOUT_MS = 12_000;

// ============================================================
// FAST PATH — STATIC HTML PARSE
// ============================================================

/**
 * Parses raw HTML text and extracts all icon candidates.
 */
function parseIconCandidates(html, baseUrl) {
  const candidates = [];
  let resolvedBase = baseUrl;

  const baseMatch = html.match(/<base\s+[^>]*href\s*=\s*["']([^"']+)["']/i);
  if (baseMatch) {
    try {
      resolvedBase = new URL(baseMatch[1], baseUrl).href;
    } catch (_e) {
      /* ignore invalid base */
    }
  }

  const baseOrigin = new URL(resolvedBase).origin;

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

  const headMatch = html.match(/<head[\s>]([\s\S]*?)<\/head>/i);
  const headHtml = headMatch ? headMatch[1] : html.slice(0, 30000);

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
        size: isSvg ? 512 : size || 16,
        priority: isSvg ? 3 : 5,
      });
    } else if (rel === 'manifest' || rel === 'webmanifest') {
      candidates.push({ url: href, type: 'manifest', size: 0, priority: 99 });
    }
  }

  // Open Graph / Twitter Card images
  const metaRegex = /<meta\s+([^>]*?)\/?>/gi;
  let metaMatch;
  while ((metaMatch = metaRegex.exec(headHtml)) !== null) {
    const attrs = metaMatch[1];
    const propMatch = attrs.match(/(?:property|name)\s*=\s*["'](og:image|twitter:image)["']/i);
    if (!propMatch) continue;
    const contentMatch = attrs.match(/content\s*=\s*["']([^"']+)["']/i);
    if (!contentMatch) continue;
    const href = resolveUrl(contentMatch[1]);
    if (href) candidates.push({ url: href, type: 'og-image', size: 256, priority: 4 });
  }

  return candidates;
}

async function extractManifestIcons(manifestUrl, baseUrl) {
  try {
    const response = await fetch(manifestUrl, {
      signal: AbortSignal.timeout(5000),
      credentials: 'include',
      headers: {
        Accept: 'application/json, application/manifest+json, */*',
        'User-Agent': CHROME_UA,
      },
    });
    if (!response.ok) return [];

    const text = await response.text();
    const cleanedText = text.replace(/^\uFEFF/, '').trim();
    const manifest = JSON.parse(cleanedText);
    if (!manifest.icons || !Array.isArray(manifest.icons)) return [];

    const baseOrigin = new URL(baseUrl).origin;

    return manifest.icons
      .filter((icon) => icon.src)
      .map((icon) => {
        let src = icon.src;
        if (!src.startsWith('http')) {
          try {
            src = src.startsWith('/') ? baseOrigin + src : new URL(src, manifestUrl).href;
          } catch {
            src = baseOrigin + '/' + src;
          }
        }
        const sizeStr = icon.sizes || '0x0';
        const size = Math.max(
          ...sizeStr.split(/\s+/).map((s) => {
            const parts = s.split('x');
            return parseInt(parts[0]) || 0;
          }),
        );
        return { url: src, type: 'manifest-icon', size, priority: 3 };
      });
  } catch {
    return [];
  }
}

async function probeWellKnownPaths(baseUrl) {
  const origin = new URL(baseUrl).origin;
  const paths = [
    { path: '/apple-touch-icon.png', type: 'well-known-apple', size: 180, priority: 6 },
    { path: '/apple-touch-icon-precomposed.png', type: 'well-known-apple', size: 180, priority: 6 },
    { path: '/apple-touch-icon-180x180.png', type: 'well-known-apple', size: 180, priority: 6 },
    { path: '/apple-touch-icon-152x152.png', type: 'well-known-apple', size: 152, priority: 6 },
    { path: '/android-chrome-512x512.png', type: 'well-known-android', size: 512, priority: 5 },
    { path: '/android-chrome-192x192.png', type: 'well-known-android', size: 192, priority: 5 },
    { path: '/favicon-512x512.png', type: 'well-known-favicon', size: 512, priority: 6 },
    { path: '/favicon-192x192.png', type: 'well-known-favicon', size: 192, priority: 7 },
    { path: '/favicon-96x96.png', type: 'well-known-favicon', size: 96, priority: 7 },
    { path: '/favicon-32x32.png', type: 'well-known-favicon', size: 32, priority: 7 },
    { path: '/favicon.svg', type: 'well-known-svg', size: 512, priority: 4 },
    { path: '/icon.svg', type: 'well-known-svg', size: 512, priority: 4 },
    { path: '/favicon.ico', type: 'well-known-favicon', size: 16, priority: 8 },
  ];

  const results = [];

  await Promise.allSettled(
    paths.map(async ({ path, type, size, priority }) => {
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
            (contentLength === 0 || contentLength > 100)
          ) {
            results.push({ url: origin + path, type, size, priority });
          }
        }
      } catch {
        /* path doesn't exist */
      }
    }),
  );

  return results;
}

async function fetchIconAsDataUrl(iconUrl) {
  try {
    const response = await fetch(iconUrl, {
      signal: AbortSignal.timeout(8000),
      credentials: 'include',
      headers: {
        Accept: 'image/png, image/jpeg, image/svg+xml, image/webp, image/x-icon, */*',
        'User-Agent': CHROME_UA,
      },
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    const type = blob.type || '';
    if (type.includes('text/html') || type.includes('application/json')) return null;
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

async function extractIcon(pageUrl) {
  let candidates = [];

  const [htmlResult, wellKnownResult] = await Promise.allSettled([
    (async () => {
      try {
        const response = await fetch(pageUrl, {
          signal: AbortSignal.timeout(10000),
          credentials: 'include',
          headers: {
            Accept: 'text/html,application/xhtml+xml',
            'User-Agent': CHROME_UA,
          },
          redirect: 'follow',
        });
        if (!response.ok) return [];
        const finalUrl = response.url || pageUrl;
        const html = await response.text();
        const parsed = parseIconCandidates(html, finalUrl);
        const manifestCandidate = parsed.find((c) => c.type === 'manifest');
        if (manifestCandidate) {
          const manifestIcons = await extractManifestIcons(manifestCandidate.url, finalUrl);
          const filtered = parsed.filter((c) => c.type !== 'manifest');
          return [...filtered, ...manifestIcons];
        }
        return parsed;
      } catch (err) {
        return [];
      }
    })(),
    probeWellKnownPaths(pageUrl),
  ]);

  if (htmlResult.status === 'fulfilled') candidates = candidates.concat(htmlResult.value);
  if (wellKnownResult.status === 'fulfilled') {
    candidates = candidates.concat(wellKnownResult.value);
  }

  const seen = new Set();
  candidates = candidates.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });

  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.size - a.size;
  });

  for (const candidate of candidates) {
    const dataUrl = await fetchIconAsDataUrl(candidate.url);
    if (dataUrl) {
      return {
        success: true,
        iconDataUrl: dataUrl,
        source: candidate.type,
        size: candidate.size,
      };
    }
  }
  return { success: false };
}

// ============================================================
// DEEP PATH — HIDDEN-TAB DOM EXTRACTION
// ============================================================

/**
 * Single-flight queue: serialize hidden-tab opens so we never have more
 * than one running at a time. This keeps memory pressure low and avoids
 * Chrome's tab-creation rate limits.
 */
let deepQueue = Promise.resolve();
function queueDeep(fn) {
  const next = deepQueue.then(fn, fn);
  // Catch internal rejection so the next caller still runs.
  deepQueue = next.catch(() => undefined);
  return next;
}

/**
 * Open the URL in a hidden background tab, wait for it to settle, run
 * a content script that harvests all icon declarations from the live
 * DOM, and return the candidate list. Closes the tab no matter what.
 */
async function harvestIconsFromHiddenTab(pageUrl) {
  let tabId = null;
  let windowId = null;

  try {
    // Create a minimized window so the tab can fully render but the user
    // never sees it. `focused: false` keeps the user's current window
    // foregrounded; `state: 'minimized'` hides our window completely.
    // Some Chromebox setups ignore minimized; in that case the window is
    // 1×1 and offscreen, still invisible.
    const win = await chrome.windows.create({
      url: pageUrl,
      focused: false,
      state: 'minimized',
      type: 'normal',
      width: 1024,
      height: 768,
    });
    windowId = win.id;
    tabId = win.tabs?.[0]?.id;
    if (typeof tabId !== 'number') throw new Error('failed to create tab');

    // Wait for the tab to reach `complete`, with a hard timeout.
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('tab load timeout')),
        TAB_LOAD_TIMEOUT_MS,
      );
      const listener = (updatedId, info) => {
        if (updatedId === tabId && info.status === 'complete') {
          clearTimeout(timer);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    // Give SPAs time to mount and inject their <link rel="icon"> tags.
    await new Promise((r) => setTimeout(r, TAB_SETTLE_MS));

    // Inject a harvester script and pull back the icon list. Returns
    // an array of { url, type, size, priority }.
    const [{ result: harvested } = { result: null }] = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN', // allows reading dynamically-injected content
      func: harvestIconsFromDocument,
    });

    return harvested ?? [];
  } catch (err) {
    console.warn('[LocalIcon-Deep] harvest failed:', err && err.message);
    return [];
  } finally {
    // Always clean up. Closing the window kills the tab too.
    if (windowId !== null) {
      try {
        await chrome.windows.remove(windowId);
      } catch {
        /* already gone */
      }
    } else if (tabId !== null) {
      try {
        await chrome.tabs.remove(tabId);
      } catch {
        /* already gone */
      }
    }
  }
}

/**
 * Runs in the page's main world. Reads every icon declaration the live
 * DOM has — including ones injected post-load by the page's JS. Also
 * inspects manifest.json links and collects og:image meta. Returns a
 * deduped, sorted candidate list.
 *
 * NOTE: this function is serialized into a string by chrome.scripting,
 * so it must be self-contained — no closures, no imports, no shared
 * helpers from the outer file.
 */
function harvestIconsFromDocument() {
  const baseUrl = location.href;
  const baseOrigin = location.origin;

  function resolveUrl(href) {
    if (!href) return null;
    href = href.trim();
    if (href.startsWith('data:')) return href;
    if (href.startsWith('//')) return location.protocol + href;
    if (href.startsWith('http://') || href.startsWith('https://')) return href;
    if (href.startsWith('/')) return baseOrigin + href;
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return null;
    }
  }

  function parseSize(sizesAttr) {
    if (!sizesAttr) return 0;
    if (sizesAttr.toLowerCase() === 'any') return 1024;
    let max = 0;
    const matches = sizesAttr.match(/(\d+)x(\d+)/g);
    if (matches) {
      for (const m of matches) {
        const [w] = m.split('x').map(Number);
        if (w > max) max = w;
      }
    }
    return max;
  }

  const candidates = [];

  // 1. Every <link rel> that mentions icon
  for (const link of document.querySelectorAll('link[rel]')) {
    const rel = (link.getAttribute('rel') || '').toLowerCase();
    if (!rel.includes('icon') && !rel.includes('mask-icon') && !rel.includes('fluid-icon'))
      continue;
    const href = link.getAttribute('href');
    if (!href) continue;
    const resolved = resolveUrl(href);
    if (!resolved) continue;
    const size = parseSize(link.getAttribute('sizes'));
    const isSvg =
      (link.getAttribute('type') || '').includes('svg') ||
      resolved.toLowerCase().includes('.svg');
    let priority = 5;
    if (rel.includes('apple-touch-icon-precomposed')) priority = 2;
    else if (rel.includes('apple-touch-icon')) priority = 1;
    else if (rel.includes('mask-icon')) priority = 4;
    else if (rel === 'icon' || rel === 'shortcut icon') priority = isSvg ? 3 : 5;
    candidates.push({
      url: resolved,
      type: 'dom-link:' + rel,
      size: size || (isSvg ? 512 : 64),
      priority,
    });
  }

  // 2. og:image / twitter:image
  for (const sel of [
    'meta[property="og:image"]',
    'meta[property="og:image:url"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
    'meta[name="twitter:image:src"]',
  ]) {
    const m = document.querySelector(sel);
    if (!m) continue;
    const c = resolveUrl(m.getAttribute('content'));
    if (c) candidates.push({ url: c, type: 'dom-og', size: 256, priority: 4 });
  }

  // 3. msapplication-TileImage
  const tile = document.querySelector('meta[name="msapplication-TileImage"]');
  const tileC = tile?.getAttribute('content');
  if (tileC) {
    const r = resolveUrl(tileC);
    if (r) candidates.push({ url: r, type: 'dom-tile', size: 144, priority: 5 });
  }

  // 4. manifest.json link
  const manifestEl = document.querySelector('link[rel~="manifest"]');
  const manifestUrl = manifestEl ? resolveUrl(manifestEl.getAttribute('href')) : null;
  if (manifestUrl) {
    candidates.push({
      url: manifestUrl,
      type: 'dom-manifest',
      size: 0,
      priority: 99,
    });
  }

  // Dedup by URL
  const seen = new Set();
  return candidates.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
}

/**
 * The DEEP extraction orchestrator. Opens the page in a hidden tab,
 * harvests live-DOM declarations, downloads the best candidate. Falls
 * back to the static path if the deep harvest produced nothing.
 */
async function extractIconDeep(pageUrl) {
  console.log('[LocalIcon-Deep] starting for', pageUrl);

  // Static well-known + HTML parse runs in parallel so we have a
  // safety-net candidate set ready while the hidden tab settles.
  const staticCandidatesP = Promise.allSettled([
    (async () => {
      try {
        const response = await fetch(pageUrl, {
          signal: AbortSignal.timeout(10000),
          credentials: 'include',
          headers: { Accept: 'text/html', 'User-Agent': CHROME_UA },
          redirect: 'follow',
        });
        if (!response.ok) return [];
        const finalUrl = response.url || pageUrl;
        const html = await response.text();
        return parseIconCandidates(html, finalUrl);
      } catch {
        return [];
      }
    })(),
    probeWellKnownPaths(pageUrl),
  ]).then((settled) => settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : [])));

  // Hidden tab harvest — the powerful path.
  const harvested = await queueDeep(() => harvestIconsFromHiddenTab(pageUrl));
  const fromStatic = await staticCandidatesP;

  let candidates = [...harvested, ...fromStatic];

  // Resolve any manifest URLs we discovered to their actual icons.
  const manifestCandidate = candidates.find(
    (c) => c.type === 'dom-manifest' || c.type === 'manifest',
  );
  if (manifestCandidate) {
    const manifestIcons = await extractManifestIcons(manifestCandidate.url, pageUrl);
    candidates = candidates.filter(
      (c) => c.type !== 'dom-manifest' && c.type !== 'manifest',
    );
    candidates = candidates.concat(manifestIcons);
  }

  // Dedupe + sort
  const seen = new Set();
  candidates = candidates.filter((c) => {
    if (seen.has(c.url)) return false;
    seen.add(c.url);
    return true;
  });
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.size - a.size;
  });

  console.log(
    '[LocalIcon-Deep] ranked',
    candidates.length,
    'candidates:',
    candidates.slice(0, 5).map((c) => `${c.type}(${c.size}px)`),
  );

  for (const candidate of candidates) {
    const dataUrl = await fetchIconAsDataUrl(candidate.url);
    if (dataUrl) {
      console.log('[LocalIcon-Deep] ✓', candidate.type, candidate.size, '→', pageUrl);
      return {
        success: true,
        iconDataUrl: dataUrl,
        source: candidate.type,
        size: candidate.size,
      };
    }
  }

  console.log('[LocalIcon-Deep] ✗ all candidates failed for', pageUrl);
  return { success: false };
}

// ============================================================
// MESSAGE LISTENER
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_ICON' && message.url) {
    extractIcon(message.url)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'EXTRACT_ICON_DEEP' && message.url) {
    extractIconDeep(message.url)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

console.log('[LocalIcon] Background service worker v3 (deep extraction) initialized.');
