const DB_NAME = 'MediaOS_DB';
const DB_VERSION = 2; // Incremented Version

class Storage {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('files')) {
                    db.createObjectStore('files', { keyPath: 'id' });
                }
                // NEW: YouTube History Store
                if (!db.objectStoreNames.contains('yt_history')) {
                    const store = db.createObjectStore('yt_history', { keyPath: 'id' });
                    store.createIndex('date', 'date', { unique: false });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };

            request.onsuccess = (e) => {
                this.db = e.target.result;
                console.log('DB Ready');
                resolve();
            };
            request.onerror = (e) => reject(e);
        });
    }

    // --- Files ---
    async addFile(fileObj) { return this._tx('files', 'readwrite', s => s.put(fileObj)); }
    async getAllFiles() { return this._tx('files', 'readonly', s => s.getAll()); }
    async clearFiles() { return this._tx('files', 'readwrite', s => s.clear()); }

    // --- History ---
    async addHistory(item) { return this._tx('yt_history', 'readwrite', s => s.put(item)); }
    async getHistory() { return this._tx('yt_history', 'readonly', s => s.getAll()); }
    async clearHistory() { return this._tx('yt_history', 'readwrite', s => s.clear()); }

    // Helper
    _tx(storeName, mode, callback) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, mode);
            const request = callback(tx.objectStore(storeName));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}

export const db = new Storage();