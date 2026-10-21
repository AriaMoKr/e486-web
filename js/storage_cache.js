/**
 * Browser Persistence & Image Cache Manager
 * - Stores system configuration, motherboard slot layout, jumper settings,
 *   CRT monitor preferences, CPU speed, and custom cards in localStorage.
 * - Caches binary ROMs (bios.bin, vgabios.bin) and disk images (A:, B:, C:,
 *   bundled disks, and user-uploaded floppies) in localStorage (for small ROMs)
 *   and IndexedDB (for 1.44MB floppies and 10MB-128MB hard disk images that
 *   exceed the 5MB localStorage quota).
 */

const CONFIG_STORAGE_KEY = 'retro486_config_v1';
const ROM_PREFIX = 'retro486_rom_';
const IDB_NAME = 'retro486_image_cache_v1';
const IDB_STORE = 'images';

export class StorageCache {
    constructor() {
        this.dbPromise = this.openDatabase();
        this.dirtySaveTimer = null;
    }

    /* ======================================================================
     * LOCALSTORAGE: SYSTEM CONFIGURATION & HARDWARE SETUP
     * ====================================================================== */

    loadConfig() {
        try {
            const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (_) {
            return null;
        }
    }

    saveConfig(configObj) {
        try {
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(configObj));
            return true;
        } catch (_) {
            return false;
        }
    }

    clearConfig() {
        try {
            localStorage.removeItem(CONFIG_STORAGE_KEY);
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(ROM_PREFIX)) keysToRemove.push(k);
            }
            keysToRemove.forEach(k => localStorage.removeItem(k));
        } catch (_) {
            // Ignore storage errors
        }
    }

    /* ======================================================================
     * LOCALSTORAGE + INDEXEDDB: BINARY ROM & DISK IMAGE CACHE
     * ====================================================================== */

    uint8ToBase64(uint8) {
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < uint8.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, uint8.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    }

    base64ToUint8(b64) {
        const binary = atob(b64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }

    openDatabase() {
        if (typeof indexedDB === 'undefined') return Promise.resolve(null);
        return new Promise((resolve) => {
            try {
                const req = indexedDB.open(IDB_NAME, 1);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(IDB_STORE)) {
                        db.createObjectStore(IDB_STORE, { keyPath: 'key' });
                    }
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = () => resolve(null);
            } catch (_) {
                resolve(null);
            }
        });
    }

    /**
     * Caches a binary image (ROM or Disk Image).
     * Small ROMs (<200KB) are cached directly in localStorage (base64) AND IndexedDB.
     * Larger disk images (1.44MB floppies, 20MB+ HDDs) are stored in localStorage if quota permits,
     * and reliably persisted in IndexedDB as raw Uint8Arrays.
     */
    async putImage(key, buffer, meta = {}) {
        const bytes = buffer instanceof Uint8Array
            ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
            : new Uint8Array(buffer);

        // Try localStorage for small binaries (<= 256KB, e.g. bios.bin & vgabios.bin)
        if (bytes.byteLength <= 262144) {
            try {
                localStorage.setItem(ROM_PREFIX + key, this.uint8ToBase64(bytes));
            } catch (_) {
                // Quota exceeded; fall through to IndexedDB
            }
        }

        const db = await this.dbPromise;
        if (!db) return false;

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                const store = tx.objectStore(IDB_STORE);
                store.put({
                    key,
                    data: new Uint8Array(bytes),
                    size: bytes.byteLength,
                    updatedAt: Date.now(),
                    ...meta
                });
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (_) {
                resolve(false);
            }
        });
    }

    async getImage(key) {
        // 1. Fast check in localStorage first
        try {
            const b64 = localStorage.getItem(ROM_PREFIX + key);
            if (b64) {
                const bytes = this.base64ToUint8(b64);
                return bytes.buffer;
            }
        } catch (_) {
            // Fall through to IndexedDB
        }

        // 2. Check IndexedDB
        const db = await this.dbPromise;
        if (!db) return null;

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const req = store.get(key);
                req.onsuccess = () => {
                    const rec = req.result;
                    if (!rec || !rec.data) {
                        resolve(null);
                        return;
                    }
                    const u8 = rec.data instanceof Uint8Array ? rec.data : new Uint8Array(rec.data);
                    resolve(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
                };
                req.onerror = () => resolve(null);
            } catch (_) {
                resolve(null);
            }
        });
    }

    async listCachedUserDisks() {
        const db = await this.dbPromise;
        if (!db) return [];

        return new Promise((resolve) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readonly');
                const store = tx.objectStore(IDB_STORE);
                const req = store.getAll();
                req.onsuccess = () => {
                    const all = req.result || [];
                    const userDisks = all
                        .filter(item => item.isUserLibraryDisk)
                        .map(item => ({
                            key: item.key,
                            name: item.name || item.filename,
                            filename: item.filename,
                            size: item.size
                        }));
                    resolve(userDisks);
                };
                req.onerror = () => resolve([]);
            } catch (_) {
                resolve([]);
            }
        });
    }

    async deleteImage(key) {
        try {
            localStorage.removeItem(ROM_PREFIX + key);
        } catch (_) {}

        const db = await this.dbPromise;
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).delete(key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (_) {
                resolve(false);
            }
        });
    }

    async clearAll() {
        this.clearConfig();
        const db = await this.dbPromise;
        if (!db) return;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction(IDB_STORE, 'readwrite');
                tx.objectStore(IDB_STORE).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (_) {
                resolve();
            }
        });
    }
}
