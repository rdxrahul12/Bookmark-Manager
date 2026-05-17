/**
 * icon-engine.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * Drop-in replacement for your existing favicon scraping in Bookmark Manager.
 * 10-layer pipeline with quality scoring, IndexedDB caching, and a guaranteed
 * fallback avatar. Works in Chrome Extension (MV3) context.
 *
 * SETUP:
 *   1. Copy this file to src/utils/icon-engine.ts
 *   2. Add to manifest.json permissions: ["favicon", "storage"]
 *   3. Add to manifest.json host_permissions: ["<all_urls>"]
 *   4. Wire up in background.ts (see CHROME EXTENSION INTEGRATION section)
 *   5. Use the React hook `useIcon(url)` in your BookmarkCard component
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ─────────────────────────── TYPES ─────────────────────────── */

export type IconFormat = 'svg' | 'png' | 'ico' | 'webp' | 'jpg' | 'generated';

export type IconSource =
    | 'chrome-favicon-api'
    | 'web-app-manifest'
    | 'apple-touch-icon'
    | 'html-link-tag'
    | 'direct-probe'
    | 'duckduckgo-api'
    | 'google-s2-api'
    | 'clearbit-logo'
    | 'favicon-ico'
    | 'generated-avatar';

export interface IconResult {
    /** Remote URL or data: URL */
    url: string;
    /** base64 data URL — always set so you can store it offline */
    dataUrl: string;
    format: IconFormat;
    source: IconSource;
    width: number;
    height: number;
    /** Composite quality score 0–100 */
    quality: number;
    /** true when served from cache */
    cached: boolean;
}

export interface IconEngineOptions {
    /** Per-strategy timeout in ms (default 8000) */
    timeoutMs?: number;
    /** IndexedDB cache TTL for successful results, ms (default 7 days) */
    cacheMaxAge?: number;
    /** Minimum quality score before trying lower-priority strategies (default 30) */
    minQuality?: number;
    /** Called after each strategy resolves — great for progressive UI updates */
    onProgress?: (source: IconSource, result: IconResult | null) => void;
}

/* ─────────────────────────── CACHE ─────────────────────────── */

const DB_NAME = 'BM_IconEngine_v3';
const DB_STORE = 'icons';
const DEFAULT_TTL = 7 * 24 * 60 * 60 * 1000;
const FAIL_TTL = 24 * 60 * 60 * 1000;

interface CacheEntry {
    key: string;
    result: IconResult | null; // null = confirmed miss (still cached so we don't re-fetch)
    expiresAt: number;
}

class IconCache {
    private db: IDBDatabase | null = null;
    private mem = new Map<string, CacheEntry>();
    private ready: Promise<void> | null = null;

    init(): Promise<void> {
        if (this.ready) return this.ready;
        this.ready = new Promise<void>((resolve) => {
            try {
                const req = indexedDB.open(DB_NAME, 1);
                req.onupgradeneeded = (e) => {
                    const db = (e.target as IDBOpenDBRequest).result;
                    if (!db.objectStoreNames.contains(DB_STORE)) {
                        db.createObjectStore(DB_STORE, { keyPath: 'key' });
                    }
                };
                req.onsuccess = (e) => {
                    this.db = (e.target as IDBOpenDBRequest).result;
                    resolve();
                };
                req.onerror = () => resolve(); // Graceful — engine will just skip caching
            } catch {
                resolve();
            }
        });
        return this.ready;
    }

    /** Returns undefined = not cached; null = cached miss; IconResult = cached hit */
    async get(key: string): Promise<IconResult | null | undefined> {
        const mem = this.mem.get(key);
        if (mem) {
            if (Date.now() < mem.expiresAt) return mem.result;
            this.mem.delete(key);
        }
        if (!this.db) return undefined;
        return new Promise((resolve) => {
            const req = this.db!.transaction(DB_STORE, 'readonly').objectStore(DB_STORE).get(key);
            req.onsuccess = () => {
                const e = req.result as CacheEntry | undefined;
                if (!e || Date.now() > e.expiresAt) { resolve(undefined); return; }
                this.mem.set(key, e);
                resolve(e.result);
            };
            req.onerror = () => resolve(undefined);
        });
    }

    async set(key: string, result: IconResult | null, ttl = DEFAULT_TTL): Promise<void> {
        const entry: CacheEntry = { key, result, expiresAt: Date.now() + ttl };
        this.mem.set(key, entry);
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db!.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).put(entry);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async invalidate(domain: string): Promise<void> {
        const key = cacheKey(domain);
        this.mem.delete(key);
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db!.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }

    async clear(): Promise<void> {
        this.mem.clear();
        if (!this.db) return;
        return new Promise((resolve) => {
            const tx = this.db!.transaction(DB_STORE, 'readwrite');
            tx.objectStore(DB_STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    }
}

const cacheKey = (domain: string) => `icon:${domain}`;

/* ─────────────────────────── QUALITY SCORER ─────────────────────────── */

function fmtScore(fmt: IconFormat): number {
    return { svg: 100, png: 85, webp: 80, jpg: 60, ico: 45, generated: 0 }[fmt] ?? 30;
}

function dimScore(w: number, h: number): number {
    const s = Math.min(w, h);
    if (s >= 512) return 100;
    if (s >= 256) return 92;
    if (s >= 192) return 86;
    if (s >= 128) return 76;
    if (s >= 96) return 66;
    if (s >= 64) return 54;
    if (s >= 48) return 44;
    if (s >= 32) return 30;
    return 14;
}

function srcScore(src: IconSource): number {
    const s: Record<IconSource, number> = {
        'chrome-favicon-api': 70,
        'web-app-manifest': 95,
        'apple-touch-icon': 90,
        'html-link-tag': 82,
        'direct-probe': 88,
        'duckduckgo-api': 64,
        'google-s2-api': 70,
        'clearbit-logo': 76,
        'favicon-ico': 40,
        'generated-avatar': 0,
    };
    return s[src] ?? 50;
}

function computeQuality(r: Pick<IconResult, 'format' | 'width' | 'height' | 'source'>): number {
    return Math.round(fmtScore(r.format) * 0.35 + dimScore(r.width, r.height) * 0.40 + srcScore(r.source) * 0.25);
}

/* ─────────────────────────── URL HELPERS ─────────────────────────── */

function getDomain(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch { return url.replace(/^https?:\/\//, '').split('/')[0]; }
}

function getOrigin(url: string): string {
    try { const u = new URL(url); return `${u.protocol}//${u.host}`; }
    catch { return ''; }
}

function resolveHref(href: string, base: string, origin: string): string {
    if (!href) return '';
    if (/^https?:\/\//i.test(href)) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return origin + href;
    return base.replace(/\/[^/]*$/, '/') + href;
}

function guessFormat(url: string, ct?: string | null): IconFormat {
    if (ct) {
        if (ct.includes('svg')) return 'svg';
        if (ct.includes('webp')) return 'webp';
        if (ct.includes('png')) return 'png';
        if (ct.includes('jpeg')) return 'jpg';
        if (ct.includes('icon') || ct.includes('x-ico')) return 'ico';
    }
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase();
    return ({ svg: 'svg', png: 'png', webp: 'webp', jpg: 'jpg', jpeg: 'jpg', ico: 'ico' } as Record<string, IconFormat>)[ext ?? ''] ?? 'png';
}

function parseSizes(sizes: string): { w: number; h: number } {
    if (!sizes || sizes === 'any') return { w: 9999, h: 9999 }; // vector = treat as huge
    const m = sizes.match(/(\d+)x(\d+)/i);
    return m ? { w: +m[1], h: +m[2] } : { w: 0, h: 0 };
}

/* ─────────────────────────── FETCH HELPERS ─────────────────────────── */

async function timedFetch(url: string, ms: number): Promise<Response> {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), ms);
    try {
        const r = await fetch(url, { signal: ctrl.signal });
        clearTimeout(id);
        return r;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result as string);
        r.onerror = rej;
        r.readAsDataURL(blob);
    });
}

async function getImgDims(src: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = src;
    });
}

/** Fetch a URL, convert to data URL, measure dimensions. Returns null on any failure. */
async function fetchAsIcon(
    url: string,
    source: IconSource,
    ms: number,
    minBytes = 80,
    overrideDims?: { w: number; h: number }
): Promise<IconResult | null> {
    try {
        const resp = await timedFetch(url, ms);
        if (!resp.ok) return null;
        const blob = await resp.blob();
        if (blob.size < minBytes) return null;

        const dataUrl = await blobToDataUrl(blob);
        const fmt = guessFormat(url, resp.headers.get('content-type'));

        let width = overrideDims?.w ?? 0;
        let height = overrideDims?.h ?? 0;
        if (!width || !height) {
            const d = await getImgDims(dataUrl);
            width = d.width || width;
            height = d.height || height;
        }

        const partial = { format: fmt, source, width, height };
        return {
            url,
            dataUrl,
            format: fmt,
            source,
            width,
            height,
            quality: computeQuality(partial),
            cached: false,
        };
    } catch {
        return null;
    }
}

/* ═══════════════════════════ STRATEGIES ═══════════════════════════ */

/* ── Strategy 1: Chrome Favicon API (Manifest V3) ── */
// Uses Chrome's own internal favicon cache — fastest path, works offline for
// sites the user has visited. Requires "favicon" permission in manifest.json.

async function strategyChromeFavicon(pageUrl: string, ms: number): Promise<IconResult | null> {
    // Path A: chrome.favicon API (available in extension background/service worker context)
    if (typeof chrome !== 'undefined' && chrome.favicon) {
        return new Promise((resolve) => {
            try {
                chrome.favicon.getUrl({ url: pageUrl, size: 128 }, (iconUrl) => {
                    if (chrome.runtime?.lastError || !iconUrl) { resolve(null); return; }
                    fetchAsIcon(iconUrl, 'chrome-favicon-api', ms).then(resolve).catch(() => resolve(null));
                });
            } catch { resolve(null); }
        });
    }

    // Path B: chrome://favicon2/ — accessible from extension pages (new tab override)
    try {
        const faviconUrl = `chrome://favicon2/?size=128&scale_factor=2x&page_url=${encodeURIComponent(pageUrl)}`;
        const result = await fetchAsIcon(faviconUrl, 'chrome-favicon-api', ms, 200);
        return result;
    } catch {
        return null;
    }
}

/* ── Strategy 2: Web App Manifest icons ── */
// Best source available. Many PWAs ship 512×512 SVG icons here.
// Requires fetching the page first to find <link rel="manifest">.

interface ParsedHtml {
    manifestUrl?: string;
    appleIcons: Array<{ href: string; sizes: string }>;
    linkIcons: Array<{ href: string; sizes: string; type: string }>;
}

async function parsePageHtml(pageUrl: string, ms: number): Promise<ParsedHtml> {
    const result: ParsedHtml = { appleIcons: [], linkIcons: [] };
    try {
        const resp = await timedFetch(pageUrl, ms);
        if (!resp.ok) return result;
        const html = await resp.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const origin = getOrigin(pageUrl);
        const res = (href: string) => resolveHref(href, pageUrl, origin);

        const manifest = doc.querySelector('link[rel="manifest"]');
        if (manifest) result.manifestUrl = res(manifest.getAttribute('href') ?? '');

        doc.querySelectorAll('link[rel]').forEach(el => {
            const rel = el.getAttribute('rel') ?? '';
            const href = res(el.getAttribute('href') ?? '');
            if (!href) return;
            if (rel.includes('apple-touch-icon')) {
                result.appleIcons.push({ href, sizes: el.getAttribute('sizes') ?? '180x180' });
            } else if (rel.includes('icon') || rel.includes('shortcut')) {
                result.linkIcons.push({
                    href,
                    sizes: el.getAttribute('sizes') ?? '0x0',
                    type: el.getAttribute('type') ?? '',
                });
            }
        });
    } catch { /* swallow */ }
    return result;
}

async function strategyManifest(manifestUrl: string, ms: number): Promise<IconResult | null> {
    try {
        const resp = await timedFetch(manifestUrl, ms);
        if (!resp.ok) return null;
        const json = await resp.json() as { icons?: Array<{ src: string; sizes?: string; type?: string; purpose?: string }> };
        if (!json.icons?.length) return null;

        const base = getOrigin(manifestUrl);
        const res = (src: string) => /^https?:\/\//i.test(src) ? src : base + (src.startsWith('/') ? src : `/${src}`);

        const scored = json.icons
            .filter(ic => !ic.purpose || ic.purpose.includes('any') || ic.purpose.includes('maskable'))
            .map(ic => {
                const { w, h } = parseSizes(ic.sizes ?? '0x0');
                const fmt = guessFormat(ic.src, ic.type);
                return { url: res(ic.src), w, h, fmt };
            })
            .sort((a, b) => {
                if (a.fmt === 'svg' && b.fmt !== 'svg') return -1;
                if (b.fmt === 'svg' && a.fmt !== 'svg') return 1;
                return b.w - a.w;
            });

        for (const ic of scored.slice(0, 3)) {
            const r = await fetchAsIcon(ic.url, 'web-app-manifest', ms / 3, 100,
                ic.w > 0 ? { w: ic.w, h: ic.h } : undefined);
            if (r) return r;
        }
    } catch { /* swallow */ }
    return null;
}

/* ── Strategy 3: Apple Touch Icon ── */
// 180×180 PNG. Exactly what Safari uses for its Start Page tiles.

async function strategyAppleTouchIcon(
    declared: Array<{ href: string; sizes: string }>,
    origin: string,
    ms: number
): Promise<IconResult | null> {
    const candidates = [
        ...declared.map(d => d.href),
        `${origin}/apple-touch-icon.png`,
        `${origin}/apple-touch-icon-precomposed.png`,
        `${origin}/apple-touch-icon-180x180.png`,
        `${origin}/apple-touch-icon-192x192.png`,
    ];

    const slice = Math.max(200, ms / candidates.length);
    for (const url of candidates) {
        const r = await fetchAsIcon(url, 'apple-touch-icon', slice, 200);
        if (r) return r;
    }
    return null;
}

/* ── Strategy 4: HTML <link rel="icon"> scoring ── */

async function strategyHtmlLinkIcons(
    icons: Array<{ href: string; sizes: string; type: string }>,
    ms: number
): Promise<IconResult | null> {
    if (!icons.length) return null;

    const scored = icons
        .map(ic => {
            const { w, h } = parseSizes(ic.sizes);
            const fmt = guessFormat(ic.href, ic.type);
            const score = dimScore(w, h) * 0.5 + fmtScore(fmt) * 0.5;
            return { ...ic, w, h, fmt, score };
        })
        .sort((a, b) => b.score - a.score);

    const slice = Math.max(300, ms / Math.min(scored.length, 4));
    for (const ic of scored.slice(0, 4)) {
        const r = await fetchAsIcon(ic.href, 'html-link-tag', slice, 50,
            ic.w > 0 ? { w: ic.w, h: ic.h } : undefined);
        if (r) return r;
    }
    return null;
}

/* ── Strategy 5: Direct path probes for SVG / large PNGs ── */

async function strategyDirectProbe(origin: string, ms: number): Promise<IconResult | null> {
    const probes = [
        `${origin}/favicon.svg`,
        `${origin}/icon.svg`,
        `${origin}/logo.svg`,
        `${origin}/favicon-512.png`,
        `${origin}/favicon-256.png`,
        `${origin}/icon-512.png`,
    ];

    const slice = Math.max(200, ms / probes.length);
    for (const url of probes) {
        const r = await fetchAsIcon(url, 'direct-probe', slice, 100);
        if (r) return r;
    }
    return null;
}

/* ── Strategies 6-8: Third-party APIs (run in parallel) ── */

async function strategyDDG(domain: string, ms: number): Promise<IconResult | null> {
    return fetchAsIcon(`https://icons.duckduckgo.com/ip3/${domain}.ico`, 'duckduckgo-api', ms, 150);
}

async function strategyGoogleS2(domain: string, ms: number): Promise<IconResult | null> {
    // sz=256 gives the largest Google will serve
    return fetchAsIcon(`https://www.google.com/s2/favicons?domain=${domain}&sz=256`, 'google-s2-api', ms, 150);
}

async function strategyClearbit(domain: string, ms: number): Promise<IconResult | null> {
    // Clearbit returns a 1×1 pixel or 404 for unknown domains — minBytes=500 filters those out
    return fetchAsIcon(`https://logo.clearbit.com/${domain}?size=512`, 'clearbit-logo', ms, 500);
}

/* ── Strategy 9: /favicon.ico ── */

async function strategyFaviconIco(origin: string, ms: number): Promise<IconResult | null> {
    return fetchAsIcon(`${origin}/favicon.ico`, 'favicon-ico', ms, 50);
}

/* ═══════════════════════════ GENERATED AVATAR ═══════════════════════════ */
// Deterministic, beautiful, iOS-style letter avatar — impossible to fail.

const BRAND_COLORS = [
    '#007AFF', '#34C759', '#FF9500', '#FF2D55', '#AF52DE',
    '#5AC8FA', '#FFCC00', '#FF6B6B', '#4ECDC4', '#45B7D1',
    '#96CEB4', '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE',
    '#85C1E9', '#F1948A', '#82E0AA', '#F8C471', '#AED6F1',
];

function domainToColor(domain: string): string {
    let h = 0;
    for (let i = 0; i < domain.length; i++) h = (h * 31 + domain.charCodeAt(i)) & 0x7fffffff;
    return BRAND_COLORS[h % BRAND_COLORS.length];
}

export function generateAvatarDataUrl(domain: string, size = 256): string {
    const letter = domain.charAt(0).toUpperCase();
    const bg = domainToColor(domain);
    const r = parseInt(bg.slice(1, 3), 16), g = parseInt(bg.slice(3, 5), 16), b = parseInt(bg.slice(5, 7), 16);
    const darker = `rgb(${Math.max(0, r - 35)},${Math.max(0, g - 35)},${Math.max(0, b - 35)})`;
    const rx = Math.round(size * 0.22);
    const fs = Math.round(size * 0.46);

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
<defs>
  <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
    <stop offset="0%" stop-color="${bg}"/>
    <stop offset="100%" stop-color="${darker}"/>
  </linearGradient>
</defs>
<rect width="${size}" height="${size}" rx="${rx}" ry="${rx}" fill="url(#g)"/>
<text x="50%" y="50%"
  font-family="-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif"
  font-size="${fs}"
  font-weight="700"
  fill="rgba(255,255,255,0.97)"
  text-anchor="middle"
  dominant-baseline="central"
>${letter}</text>
</svg>`;

    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
}

export function makeAvatar(domain: string): IconResult {
    const dataUrl = generateAvatarDataUrl(domain);
    return {
        url: dataUrl, dataUrl,
        format: 'generated',
        source: 'generated-avatar',
        width: 256, height: 256,
        quality: 5,
        cached: false,
    };
}

/* ═══════════════════════════ MAIN ENGINE ═══════════════════════════ */

export class IconEngine {
    private cache = new IconCache();
    private opts: Required<IconEngineOptions>;
    private _init: Promise<void> | null = null;

    constructor(opts: IconEngineOptions = {}) {
        this.opts = {
            timeoutMs: opts.timeoutMs ?? 8_000,
            cacheMaxAge: opts.cacheMaxAge ?? DEFAULT_TTL,
            minQuality: opts.minQuality ?? 30,
            onProgress: opts.onProgress ?? (() => { }),
        };
    }

    private init(): Promise<void> {
        this._init ??= this.cache.init();
        return this._init;
    }

    /**
     * Fetch the best possible icon for `pageUrl`.
     * NEVER rejects — always returns at least a generated avatar.
     *
     * The pipeline progresses through 10 strategies in quality order.
     * It stops early if it finds something with quality >= `minQuality`.
     * At each strategy, `onProgress` fires so you can update the UI immediately.
     */
    async fetchIcon(pageUrl: string): Promise<IconResult> {
        await this.init();

        const domain = getDomain(pageUrl);
        const origin = getOrigin(pageUrl);
        const key = cacheKey(domain);
        const { timeoutMs: ms, onProgress, minQuality } = this.opts;

        // ── Cache hit ────────────────────────────────────────────────────────
        const hit = await this.cache.get(key);
        if (hit !== undefined) {
            if (hit) { hit.cached = true; return hit; }
            return makeAvatar(domain);
        }

        // ── Show avatar immediately while pipeline runs ───────────────────
        const avatar = makeAvatar(domain);
        onProgress('generated-avatar', avatar);

        let best: IconResult | null = null;

        const update = (r: IconResult | null) => {
            if (!r) return;
            onProgress(r.source, r);
            if (!best || r.quality > best.quality) best = r;
        };

        const done = () => best && best.quality >= 90;

        try {
            // ── 1. Chrome Favicon API ─────────────────────────────────────────
            update(await strategyChromeFavicon(pageUrl, ms * 0.4));
            if (done()) return this.#finish(key, best!);

            // ── 2-4 in parallel: HTML parse → manifest, apple icon, link icons ─
            const htmlInfo = await parsePageHtml(pageUrl, ms * 0.5);

            const [manifestR, appleR, linkR] = await Promise.allSettled([
                htmlInfo.manifestUrl ? strategyManifest(htmlInfo.manifestUrl, ms * 0.6) : Promise.resolve(null),
                strategyAppleTouchIcon(htmlInfo.appleIcons, origin, ms * 0.5),
                strategyHtmlLinkIcons(htmlInfo.linkIcons, ms * 0.5),
            ]);

            for (const r of [manifestR, appleR, linkR]) {
                if (r.status === 'fulfilled') update(r.value);
            }
            if (done()) return this.#finish(key, best!);

            // ── 5. Direct path probes ─────────────────────────────────────────
            update(await strategyDirectProbe(origin, ms * 0.5));
            if (done()) return this.#finish(key, best!);

            // ── 6-8. Third-party APIs (parallel) ─────────────────────────────
            if (!best || best.quality < 70) {
                const [ddg, g, cb] = await Promise.allSettled([
                    strategyDDG(domain, ms * 0.4),
                    strategyGoogleS2(domain, ms * 0.4),
                    strategyClearbit(domain, ms * 0.5),
                ]);
                for (const r of [ddg, g, cb]) {
                    if (r.status === 'fulfilled') update(r.value);
                }
                if (done()) return this.#finish(key, best!);
            }

            // ── 9. favicon.ico ───────────────────────────────────────────────
            if (!best || best.quality < 40) {
                update(await strategyFaviconIco(origin, ms * 0.4));
            }

        } catch { /* full pipeline failure — fall through to avatar */ }

        // ── 10. Generated avatar (NEVER FAILS) ───────────────────────────
        if (!best || best.quality < minQuality) {
            await this.cache.set(key, null, FAIL_TTL);
            onProgress('generated-avatar', avatar);
            return avatar;
        }

        return this.#finish(key, best);
    }

    #finish(key: string, result: IconResult): Promise<IconResult> {
        return this.cache.set(key, result, this.opts.cacheMaxAge).then(() => result);
    }

    /**
     * Fetch icons for many URLs with controlled parallelism.
     * `onEach` fires as each icon resolves — perfect for progressive rendering.
     */
    async fetchIcons(
        urls: string[],
        {
            concurrency = 6,
            onEach,
        }: { concurrency?: number; onEach?: (url: string, result: IconResult) => void } = {}
    ): Promise<Map<string, IconResult>> {
        const results = new Map<string, IconResult>();
        const queue = [...urls];

        const worker = async () => {
            while (queue.length > 0) {
                const url = queue.shift()!;
                const r = await this.fetchIcon(url);
                results.set(url, r);
                onEach?.(url, r);
            }
        };

        await Promise.allSettled(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
        return results;
    }

    /** Force a re-fetch, bypassing cache. */
    async refreshIcon(pageUrl: string): Promise<IconResult> {
        await this.init();
        await this.cache.invalidate(getDomain(pageUrl));
        return this.fetchIcon(pageUrl);
    }

    /** Wipe everything. */
    async clearCache(): Promise<void> {
        await this.init();
        return this.cache.clear();
    }
}

/* ═══════════════════════ CHROME EXTENSION INTEGRATION ═══════════════════════
 *
 * Because fetch() in a content script / extension page is subject to CORS, the
 * cleanest architecture is to run the engine in the background service worker,
 * which can fetch any URL freely. The UI sends messages and gets back results.
 *
 * ── background.ts ──────────────────────────────────────────────────────────
 *
 *   import { IconEngine } from './utils/icon-engine';
 *
 *   const engine = new IconEngine({ timeoutMs: 10_000 });
 *
 *   chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
 *     if (msg.type !== 'FETCH_ICON') return false;
 *     engine.fetchIcon(msg.url)
 *       .then(result => respond({ ok: true, result }))
 *       .catch(err   => respond({ ok: false, error: String(err) }));
 *     return true; // keep message channel open
 *   });
 *
 * ── UI / content-script helper ─────────────────────────────────────────────
 *
 *   export async function fetchIconViaBackground(url: string): Promise<IconResult> {
 *     return new Promise((resolve) => {
 *       chrome.runtime.sendMessage({ type: 'FETCH_ICON', url }, (resp) => {
 *         if (resp?.ok) resolve(resp.result);
 *         else resolve(makeAvatar(getDomain(url)));
 *       });
 *     });
 *   }
 *
 * ── manifest.json additions ────────────────────────────────────────────────
 *
 *   "permissions": ["favicon", "storage", "tabs"],
 *   "host_permissions": ["<all_urls>"],
 *
 * ════════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════ REACT HOOK ═══════════════════════════════════
 *
 * Drop into your BookmarkCard or wherever you render icons.
 * Shows the generated avatar instantly, upgrades to real icon when ready.
 *
 *   import { useIcon } from './utils/icon-engine';
 *
 *   function BookmarkCard({ url, title }) {
 *     const { dataUrl, loading } = useIcon(url);
 *     return (
 *       <div>
 *         <img
 *           src={dataUrl}
 *           width={48} height={48}
 *           style={{ borderRadius: 10, opacity: loading ? 0.75 : 1, transition: 'opacity 0.2s' }}
 *         />
 *         <span>{title}</span>
 *       </div>
 *     );
 *   }
 *
 * ════════════════════════════════════════════════════════════════════════════ */

// Global singleton — create once, reuse everywhere in the extension page.
export const globalIconEngine = new IconEngine({
    timeoutMs: 8_000,
    cacheMaxAge: DEFAULT_TTL,
    minQuality: 30,
});

// Inline hook (no external deps beyond React)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useIcon(url: string): { dataUrl: string; quality: number; loading: boolean; source: IconSource } {
    // Placeholder — real hook below
    void url;
    throw new Error(
        'Import useIcon from a .tsx file and paste the hook body there. ' +
        'The hook is provided here as a template comment to avoid importing React in a .ts file.'
    );
}

/*
// ── Paste this into your .tsx component file ────────────────────────────────

import { useState, useEffect } from 'react';
import { globalIconEngine, makeAvatar, getDomain, IconResult, IconSource } from './utils/icon-engine';

export function useIcon(url: string) {
  const [state, setState] = useState<IconResult>(() => makeAvatar(getDomain(url)));

  useEffect(() => {
    if (!url) return;
    setState(makeAvatar(getDomain(url))); // instant placeholder

    globalIconEngine.fetchIcon(url).then(result => {
      setState(result);
    });
  }, [url]);

  return {
    dataUrl: state.dataUrl,
    quality: state.quality,
    source:  state.source,
    loading: state.source === 'generated-avatar',
  };
}
*/

export { getDomain, computeQuality };