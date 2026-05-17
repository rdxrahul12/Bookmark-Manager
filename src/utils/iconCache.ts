const DB_NAME = "BookmarkDelightCache";
const STORE_NAME = "icons";
const DB_VERSION = 4; // Bumped to 4 to clear poisoned cache (YouTube whitish icon)

class IconCache {
    private db: IDBDatabase | null = null;
    private dbPromise: Promise<IDBDatabase>;

    constructor() {
        this.dbPromise = this.initDB();
    }

    private initDB(): Promise<IDBDatabase> {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(request.result);
            };

            request.onupgradeneeded = (event) => {
                const db = (event.target as IDBOpenDBRequest).result;
                // Force clear cache on upgrade
                if (db.objectStoreNames.contains(STORE_NAME)) {
                    db.deleteObjectStore(STORE_NAME);
                }
                db.createObjectStore(STORE_NAME);
            };
        });
    }

    /**
     * Get a cached icon by its key (URL or domain key).
     */
    async get(key: string): Promise<Blob | null> {
        try {
            const db = await this.dbPromise;
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readonly");
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(key);

                request.onsuccess = () => resolve(request.result as Blob || null);
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error("Cache get error:", e);
            return null;
        }
    }

    /**
     * Store a cached icon by its key.
     */
    async set(key: string, blob: Blob): Promise<void> {
        try {
            const db = await this.dbPromise;
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readwrite");
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(blob, key);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error("Cache set error:", e);
        }
    }

    /**
     * Get a cached icon by domain (for locally-extracted icons).
     * Uses a "domain:" prefix to differentiate from URL-based keys.
     */
    async getByDomain(domain: string): Promise<string | null> {
        try {
            const db = await this.dbPromise;
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readonly");
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(`domain:${domain}`);

                request.onsuccess = () => {
                    const result = request.result;
                    if (typeof result === 'string') {
                        resolve(result); // It's a data URL string
                    } else {
                        resolve(null);
                    }
                };
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error("Cache getByDomain error:", e);
            return null;
        }
    }

    /**
     * Store a locally-extracted icon by domain as a data URL string.
     */
    async setByDomain(domain: string, dataUrl: string): Promise<void> {
        try {
            const db = await this.dbPromise;
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readwrite");
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(dataUrl, `domain:${domain}`);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error("Cache setByDomain error:", e);
        }
    }

    /**
     * Delete a cached icon by domain (useful for manual refresh).
     */
    async deleteByDomain(domain: string): Promise<void> {
        try {
            const db = await this.dbPromise;
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, "readwrite");
                const store = transaction.objectStore(STORE_NAME);
                const request = store.delete(`domain:${domain}`);

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error("Cache deleteByDomain error:", e);
        }
    }
}

export const iconCache = new IconCache();
