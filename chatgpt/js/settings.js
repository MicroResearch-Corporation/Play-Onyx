
async function saveSetting(key, value) {
  store("settings","readwrite").put({ key, value });
}

async function getSetting(key) {
  return new Promise(res => {
    const r = store("settings").get(key);
    r.onsuccess = () => res(r.result?.value);
  });
}

document.getElementById("exportBtn").onclick = async () => {
  const data = {};
  ["settings"].forEach(s => {
    store(s).getAll().onsuccess = e => data[s] = e.target.result;
  });
  setTimeout(() => {
    const blob = new Blob([JSON.stringify(data)], {type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "media-player-backup.json";
    a.click();
  }, 300);
};

document.getElementById("importBtn").onclick = () =>
  document.getElementById("importFile").click();

document.getElementById("importFile").onchange = async e => {
  const data = JSON.parse(await e.target.files[0].text());
  Object.entries(data).forEach(([k, arr]) => {
    const st = store(k,"readwrite");
    arr.forEach(i => st.put(i));
  });
  location.reload();
};

document.getElementById("resetBtn").onclick = () => {
  indexedDB.deleteDatabase(DB_NAME);
  location.reload();
};
