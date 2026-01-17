
const DB_NAME = "mediaPlayerDB";
const DB_VERSION = 2;
let db;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      db = e.target.result;
      if (!db.objectStoreNames.contains("library")) db.createObjectStore("library", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("playlists")) db.createObjectStore("playlists", { keyPath: "name" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id", autoIncrement: true });
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = () => reject(new Error("IndexedDB failed"));
  });
}

// library
async function addToLibrary(item) {
  const tx = db.transaction("library", "readwrite");
  tx.objectStore("library").add(item);
  return tx.complete;
}
function getLibrary(){ return new Promise(res=>{ const tx=db.transaction("library"); const req=tx.objectStore("library").getAll(); req.onsuccess=()=>res(req.result); }); }
function clearLibrary(){ const tx=db.transaction("library","readwrite"); tx.objectStore("library").clear(); return tx.complete; }

// playlists
function savePlaylist(name, items){ const tx=db.transaction("playlists","readwrite"); tx.objectStore("playlists").put({name, items}); return tx.complete; }
function getPlaylists(){ return new Promise(res=>{ const tx=db.transaction("playlists"); const req=tx.objectStore("playlists").getAll(); req.onsuccess=()=>res(req.result); }); }
function deletePlaylist(name){ const tx=db.transaction("playlists","readwrite"); tx.objectStore("playlists").delete(name); return tx.complete; }
function getPlaylist(name){ return new Promise(res=>{ const tx=db.transaction("playlists"); const req=tx.objectStore("playlists").get(name); req.onsuccess=()=>res(req.result && req.result.items ? req.result.items : []); }); }

// settings
function saveSetting(key, value){ const tx=db.transaction("settings","readwrite"); tx.objectStore("settings").put({key,value}); return tx.complete; }
function getSetting(key){ return new Promise(res=>{ const tx=db.transaction("settings"); const req=tx.objectStore("settings").get(key); req.onsuccess=()=>res(req.result ? req.result.value : null); }); }
function getAllSettings(){ return new Promise(res=>{ const tx=db.transaction("settings"); const req=tx.objectStore("settings").getAll(); req.onsuccess=()=>res(req.result); }); }
function clearSettings(){ const tx=db.transaction("settings","readwrite"); tx.objectStore("settings").clear(); return tx.complete; }

// queue
function clearQueue(){ const tx=db.transaction("queue","readwrite"); tx.objectStore("queue").clear(); return tx.complete; }
function addToQueueItem(item){ const tx=db.transaction("queue","readwrite"); tx.objectStore("queue").add(item); return tx.complete; }
function getQueueItems(){ return new Promise(res=>{ const tx=db.transaction("queue"); const req=tx.objectStore("queue").getAll(); req.onsuccess=()=>res(req.result); }); }
function removeQueueItem(id){ const tx=db.transaction("queue","readwrite"); tx.objectStore("queue").delete(id); return tx.complete; }

// export/import
async function exportData(){
  const lib = await getLibrary();
  const pls = await getPlaylists();
  const settings = await getAllSettings();
  const queue = await getQueueItems();
  return { library: lib, playlists: pls, settings: settings, queue: queue };
}
async function importData(obj){
  // simple - clears and imports (use carefully)
  await clearLibrary();
  await clearSettings();
  await clearQueue();
  const pls = await getPlaylists();
  // import library
  for (const it of (obj.library||[])) {
    const copy = Object.assign({}, it); delete copy.id; await addToLibrary(copy);
  }
  // import playlists
  for (const p of (obj.playlists||[])) { await savePlaylist(p.name, p.items || []); }
  // import settings
  for (const s of (obj.settings||[])) { await saveSetting(s.key, s.value); }
  // import queue
  for (const q of (obj.queue||[])) { const copy = Object.assign({}, q); delete copy.id; await addToQueueItem(copy); }
  return true;
}

// reset everything
async function resetAll(){
  await clearLibrary();
  await clearSettings();
  await clearQueue();
  // clear playlists
  const pls = await getPlaylists();
  for (const p of pls) await deletePlaylist(p.name);
  return true;
}
