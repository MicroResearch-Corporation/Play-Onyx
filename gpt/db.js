export const DB = (() => {
  let db;
  const DB_NAME = 'ultraplay-db';
  const DB_VERSION = 3;

  async function init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const database = e.target.result;
        if (!database.objectStoreNames.contains('media')) {
          const store = database.createObjectStore('media', { keyPath: 'id' });
          store.createIndex('title', 'title', { unique: false });
        }
        if (!database.objectStoreNames.contains('playlists')) {
          database.createObjectStore('playlists', { keyPath: 'id' });
        }
        if (!database.objectStoreNames.contains('playbackProgress')) {
          database.createObjectStore('playbackProgress', { keyPath: 'mediaId' });
        }
      };

      request.onsuccess = () => { db = request.result; resolve(); };
      request.onerror = () => reject(request.error);
    });
  }

  async function put(storeName, data) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const req = store.put(data);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function get(storeName, key) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(storeName) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  return { init, put, get, getAll };
})();
