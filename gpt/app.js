// Improved media player with subtitles, drag-drop queue, shuffle/repeat, EQ & visualizer, position saving
const dbName = "mediaPlayerDB_v2";
let db;
const openDB = ()=> new Promise((res,rej)=>{
  const req = indexedDB.open(dbName,2);
  req.onupgradeneeded = e => {
    db = e.target.result;
    if(!db.objectStoreNames.contains('files')) db.createObjectStore('files', {keyPath:'id'});
    if(!db.objectStoreNames.contains('playlists')) db.createObjectStore('playlists',{keyPath:'id'});
    if(!db.objectStoreNames.contains('meta')) db.createObjectStore('meta',{keyPath:'k'});
  };
  req.onsuccess = e => { db = e.target.result; res(db) };
  req.onerror = e => rej(e);
});

function id(){ return 'id-'+Math.random().toString(36).slice(2,9); }

async function put(store, value){ return new Promise((res,rej)=>{
  const tx = db.transaction(store,'readwrite').objectStore(store);
  const r = tx.put(value);
  r.onsuccess = ()=>res(r.result);
  r.onerror = e=>rej(e);
})}

async function getAll(store){ return new Promise((res,rej)=>{
  const tx = db.transaction(store,'readonly').objectStore(store);
  const req = tx.getAll();
  req.onsuccess = ()=>res(req.result);
  req.onerror = e=>rej(e);
})}

// UI refs
const fileInput = document.getElementById('fileInput');
const openLibraryBtn = document.getElementById('openLibraryBtn');
const video = document.getElementById('video');
const playBtn = document.getElementById('playBtn');
const queueUL = document.getElementById('queueUL');
const queue = [];
let currentIndex = -1;

// playback features
let shuffle=false, repeatMode='off'; // 'off'|'one'|'all'
let analyser, audioCtx, sourceNode, eqNodes=[];

// init
document.addEventListener('DOMContentLoaded', async ()=>{
  await openDB();
  hookUI();
  await renderLibrary();
  await renderPlaylists();
  await loadMetaIntoMemory();
  await renderQueue();
  restoreLastSession();
  setupVisualizer();
  bindKeyboardShortcuts();
  window.addEventListener('beforeunload', savePositions);
});

// UI wiring
function hookUI(){
  openLibraryBtn.addEventListener('click', ()=>fileInput.click());
  fileInput.addEventListener('change', e=>handleFiles(e.target.files));
  document.getElementById('urlAddBtn').addEventListener('click', ()=>showModal('urlModal'));
  document.getElementById('ytAddBtn').addEventListener('click', ()=>showModal('ytModal'));
  document.getElementById('settingsBtn').addEventListener('click', ()=>showModal('settingsModal'));

  document.querySelectorAll('.closeModal').forEach(b=>b.addEventListener('click', ()=>closeModals()));
  document.getElementById('addUrlConfirm').addEventListener('click', addUrl);
  document.getElementById('addYtConfirm').addEventListener('click', addYouTube);
  document.getElementById('exportDataBtn').addEventListener('click', exportData);
  document.getElementById('importFile').addEventListener('change', importData);
  document.getElementById('resetDataBtn').addEventListener('click', resetData);

  playBtn.addEventListener('click', ()=>{ if(video.paused) video.play(); else video.pause(); });
  video.addEventListener('play', ()=>playBtn.textContent='⏸');
  video.addEventListener('pause', ()=>playBtn.textContent='▶');
  video.addEventListener('timeupdate', onTimeUpdate);
  document.getElementById('seek').addEventListener('input', e=>{
    const pct = e.target.value/100;
    if(video.duration) video.currentTime = pct * video.duration;
  });

  document.getElementById('pipBtn').addEventListener('click', async ()=>{ try{ if(document.pictureInPictureElement) await document.exitPictureInPicture(); else await video.requestPictureInPicture(); }catch(e){alert('PiP not supported')} });
  document.getElementById('speedBtn').addEventListener('click', ()=>{
    const s = video.playbackRate;
    const next = s>=2?1:s+0.25;
    video.playbackRate = Math.round(next*100)/100;
    document.getElementById('speedBtn').textContent = video.playbackRate + '×';
  });

  // shuffle/repeat
  document.getElementById('shuffleBtn').addEventListener('click', ()=>{ shuffle = !shuffle; document.getElementById('shuffleBtn').style.opacity = shuffle?1:0.6; });
  document.getElementById('repeatBtn').addEventListener('click', ()=>{ if(repeatMode==='off') repeatMode='all'; else if(repeatMode==='all') repeatMode='one'; else repeatMode='off'; document.getElementById('repeatBtn').textContent = 'Repeat: '+repeatMode; });

  // subtitles
  document.getElementById('subFile').addEventListener('change', onSubUpload);
  document.getElementById('subTracks').addEventListener('change', e=>{ const idx = e.target.value; for(const t of video.textTracks) t.mode='disabled'; if(idx!=='') video.textTracks[idx].mode='showing'; });

  // volume
  const vol = document.getElementById('volume');
  vol.addEventListener('input', ()=>{ video.volume = parseFloat(vol.value); saveMeta('volume', video.volume); });

  // playlist creation and library
  document.getElementById('createPlaylistBtn').addEventListener('click', createPlaylist);
  document.getElementById('newPlaylistName').addEventListener('keydown', e=>{ if(e.key==='Enter') createPlaylist(); });
  document.getElementById('importBtn').addEventListener('click', ()=>document.getElementById('importFile').click());
  document.getElementById('exportBtn').addEventListener('click', exportData);
  document.getElementById('resetBtn').addEventListener('click', resetData);

  document.getElementById('clearQueueBtn').addEventListener('click', ()=>{ if(confirm('Clear queue?')){ queue.splice(0); saveMeta('queue',queue); renderQueue(); } });
  document.getElementById('saveQueueBtn').addEventListener('click', saveQueueAsPlaylist);

  // tabs
  document.querySelectorAll('.sidebar .tab').forEach(b=>b.addEventListener('click', e=>{ document.querySelectorAll('.sidebar .tab').forEach(t=>t.classList.remove('active')); e.target.classList.add('active'); const tab = e.target.dataset.tab; document.querySelectorAll('.tabpanel').forEach(p=>p.classList.add('hidden')); document.getElementById(tab+'Panel').classList.remove('hidden'); }));
}

// handle files
async function handleFiles(list){
  const arr = Array.from(list);
  for(const f of arr){
    const entry = { id:id(), name:f.name, size:f.size, type:f.type, added:Date.now(), positions: {} };
    const ab = await f.arrayBuffer();
    entry.blob = new Blob([ab], {type: f.type || 'application/octet-stream'});
    entry.url = URL.createObjectURL(entry.blob);
    const meta = await extractMetadata(entry.url);
    entry.duration = meta.duration; entry.width=meta.width; entry.height=meta.height;
    entry.thumbnail = meta.thumbnail;
    await put('files', entry);
    URL.revokeObjectURL(entry.url);
  }
  await renderLibrary();
}

// extract metadata + thumbnail
function extractMetadata(url){
  return new Promise((res)=>{
    const v = document.createElement('video');
    v.preload='metadata'; v.src = url; v.muted = true;
    v.addEventListener('loadedmetadata', ()=>{
      const duration = v.duration || 0;
      const width = v.videoWidth || 0, height = v.videoHeight || 0;
      v.currentTime = Math.min(1, Math.max(0, duration*0.05));
      v.addEventListener('seeked', ()=>{
        const c = document.createElement('canvas');
        c.width = Math.min(320, v.videoWidth || 320);
        c.height = Math.min(180, v.videoHeight || 180);
        const ctx = c.getContext('2d');
        try{ ctx.drawImage(v,0,0,c.width,c.height); }catch(e){}
        const thumb = c.toDataURL('image/jpeg',0.7);
        res({duration, width, height, thumbnail:thumb});
      }, {once:true});
    }, {once:true});
    setTimeout(()=>res({duration:0,width:0,height:0,thumbnail:''}),6000);
  });
}

// render library
async function renderLibrary(filter=''){
  const files = await getAll('files');
  const listEl = document.getElementById('libraryUL');
  listEl.innerHTML='';
  files.filter(f=>f.name.toLowerCase().includes(filter.toLowerCase())).forEach(f=>{
    const li = document.createElement('li');
    li.style.display='flex';li.style.alignItems='center';li.style.gap='8px';li.style.padding='8px';li.style.border='1px solid #f1f3f5';li.style.borderRadius='8px';li.style.marginBottom='6px';
    const img = document.createElement('img'); img.src = f.thumbnail || ''; img.width=90; img.height=60; img.style.objectFit='cover';
    const meta = document.createElement('div'); meta.style.flex='1';
    meta.innerHTML = `<strong>${f.name}</strong><div style="color:#6b7280;font-size:12px">${formatTime(f.duration || 0)} • ${f.width}x${f.height}</div>`;
    const actions = document.createElement('div');
    const addBtn = document.createElement('button'); addBtn.textContent='Add→'; addBtn.addEventListener('click', ()=>enqueueFromLibrary(f.id));
    const delBtn = document.createElement('button'); delBtn.textContent='Delete'; delBtn.addEventListener('click', ()=>deleteFile(f.id));
    actions.appendChild(addBtn); actions.appendChild(delBtn);
    li.appendChild(img); li.appendChild(meta); li.appendChild(actions);
    listEl.appendChild(li);
  });
}

// enqueue
async function enqueueFromLibrary(id){
  const tx = db.transaction('files','readonly').objectStore('files');
  const req = tx.get(id);
  req.onsuccess = async ()=>{
    const f = req.result;
    if(!f) return;
    const q = { id: f.id, name: f.name, type:'local' };
    queue.push(q);
    await saveMeta('queue', queue);
    await renderQueue();
    if(currentIndex === -1) playIndex(0);
  }
}

async function deleteFile(id){
  const tx = db.transaction('files','readwrite').objectStore('files');
  const req = tx.delete(id);
  req.onsuccess = ()=> renderLibrary();
}

// render queue with drag-drop
function renderQueue(){
  return new Promise(async res=>{
    const list = document.getElementById('queueUL');
    list.innerHTML='';
    queue.forEach((item, idx)=>{
      const li = document.createElement('li');
      li.draggable = true;
      li.dataset.index = idx;
      li.style.display='flex'; li.style.alignItems='center'; li.style.justifyContent='space-between'; li.style.padding='6px'; li.style.borderRadius='6px'; li.style.marginBottom='6px';
      const left = document.createElement('div'); left.style.display='flex'; left.style.alignItems='center'; left.style.gap='8px';
      const thumb = document.createElement('img'); thumb.width=90; thumb.height=56; thumb.style.objectFit='cover';
      // try to fetch thumbnail from files store
      if(item.type==='local'){
        const req = db.transaction('files','readonly').objectStore('files').get(item.id);
        req.onsuccess = ()=>{ const f=req.result; thumb.src = f?f.thumbnail:''; left.appendChild(thumb); };
      } else {
        thumb.src=''; left.appendChild(thumb);
      }
      const title = document.createElement('div'); title.textContent = (idx+1)+'. '+item.name; left.appendChild(title);
      const right = document.createElement('div');
      const playNow = document.createElement('button'); playNow.textContent='Play'; playNow.addEventListener('click', ()=>playIndex(idx));
      const remove = document.createElement('button'); remove.textContent='✖'; remove.addEventListener('click', ()=>{ queue.splice(idx,1); saveMeta('queue',queue); renderQueue(); });
      right.appendChild(playNow); right.appendChild(remove);
      li.appendChild(left); li.appendChild(right);
      list.appendChild(li);
    });

    // drag/drop reorder
    let dragEl = null;
    list.addEventListener('dragstart', e=>{ dragEl = e.target; e.target.classList.add('dragging'); });
    list.addEventListener('dragend', e=>{ if(dragEl) dragEl.classList.remove('dragging'); dragEl=null; });
    list.addEventListener('dragover', e=>{ e.preventDefault(); const after = getDragAfterElement(list, e.clientY); if(after==null) list.appendChild(dragEl); else list.insertBefore(dragEl, after); });
    list.addEventListener('drop', async e=>{
      e.preventDefault();
      // rebuild queue order from DOM
      const items = Array.from(list.querySelectorAll('li'));
      const newQueue = items.map(li=> queue[parseInt(li.dataset.index)] );
      queue.splice(0, queue.length, ...newQueue);
      await saveMeta('queue', queue);
      renderQueue();
    });

    res();
  });
}

function getDragAfterElement(container, y){
  const draggableElements = [...container.querySelectorAll('li:not(.dragging)')];
  return draggableElements.reduce((closest, child)=>{
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height/2;
    if(offset < 0 && offset > closest.offset) return {offset, element: child};
    return closest;
  }, {offset: Number.NEGATIVE_INFINITY}).element;
}

// play index
async function playIndex(i){
  if(i<0 || i>=queue.length) return;
  currentIndex = i;
  const item = queue[i];
  if(item.type === 'local'){
    const req = db.transaction('files','readonly').objectStore('files').get(item.id);
    req.onsuccess = ()=>{ const f = req.result; if(!f) return; const url = URL.createObjectURL(f.blob); loadMedia(url, f); video.play(); saveMeta('last', { index:i, id: item.id }); setTimeout(()=>URL.revokeObjectURL(url), 20000); }
  } else if(item.type === 'url'){
    loadMedia(item.url, {name:item.name}); video.play(); saveMeta('last',{index:i,url:item.url});
  } else if(item.type === 'youtube'){
    openYouTubePlayer(item.url);
  }
  renderQueue();
}

// load media into video tag (set metadata UI, connect audio nodes)
function loadMedia(src, fileMeta={}){
  video.src = src;
  document.getElementById('metaTitle').textContent = fileMeta.name || src.split('/').pop() || '—';
  document.getElementById('metaDetails').textContent = `${fileMeta.width||''}x${fileMeta.height||''} • ${formatTime(fileMeta.duration||0)}`;
  document.getElementById('metaThumb').src = fileMeta.thumbnail || '';
  const trackSelect = document.getElementById('subTracks');
  trackSelect.innerHTML = '<option value="">No subtitles</option>';
  connectAudioNodes();
  if(fileMeta.id){
    const req = db.transaction('files','readonly').objectStore('files').get(fileMeta.id);
    req.onsuccess = ()=>{ const f = req.result; if(f && f.lastPosition) video.currentTime = f.lastPosition; }
  }
}

// on time update: save position periodically and update UI
let lastSavedTime = 0;
function onTimeUpdate(){
  document.getElementById('timeLabel').textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration||0)}`;
  const seek = document.getElementById('seek');
  if(video.duration) seek.value = Math.round((video.currentTime / video.duration) * 100);
  if(Date.now() - lastSavedTime > 5000){ saveCurrentPosition(); lastSavedTime = Date.now(); }
}

async function saveCurrentPosition(){
  if(currentIndex<0 || currentIndex>=queue.length) return;
  const item = queue[currentIndex];
  if(item.type !== 'local') return;
  const tx = db.transaction('files','readwrite').objectStore('files');
  const req = tx.get(item.id);
  req.onsuccess = async ()=>{ const f = req.result; if(!f) return; f.lastPosition = video.currentTime; await put('files', f); }
}

async function savePositions(){ await saveCurrentPosition(); }

// format time
function formatTime(s){ if(!s || isNaN(s) || !isFinite(s)) return '00:00'; const m=Math.floor(s/60).toString().padStart(2,'0'); const sec=Math.floor(s%60).toString().padStart(2,'0'); return `${m}:${sec}`; }

// URL modal
function showModal(id){ document.getElementById(id).classList.remove('hidden'); }
function closeModals(){ document.querySelectorAll('.modal').forEach(m=>m.classList.add('hidden')); }
async function addUrl(){ const url = document.getElementById('urlInput').value.trim(); if(!url) return alert('Enter URL'); const item = { id:id(), name: url.split('/').pop()||url, type:'url', url }; queue.push(item); await saveMeta('queue', queue); await renderQueue(); closeModals(); if(currentIndex===-1) playIndex(0); }

// YouTube modal add
function addYouTube(){ let v = document.getElementById('ytInput').value.trim(); if(!v) return alert('enter id or url'); const idm = extractYtID(v); if(!idm) return alert('cannot detect'); const item = { id:id(), name:'YouTube: '+idm, type:'youtube', url: idm }; queue.push(item); saveMeta('queue',queue); renderQueue(); closeModals(); if(currentIndex===-1) playIndex(0); }

function extractYtID(s){ try{ const u = new URL(s); if(u.hostname.includes('youtube.com')) return u.searchParams.get('v'); if(u.hostname.includes('youtu.be')) return u.pathname.slice(1); }catch(e){} if(/^[A-Za-z0-9_-]{11}$/.test(s)) return s; return null; }

function openYouTubePlayer(id){ const overlay = document.createElement('div'); overlay.style.position='fixed';overlay.style.inset='0';overlay.style.background='rgba(0,0,0,0.6)';overlay.style.display='flex';overlay.style.alignItems='center';overlay.style.justifyContent='center';overlay.style.zIndex='9999'; const box = document.createElement('div'); box.style.width='90%'; box.style.maxWidth='900px'; box.style.aspectRatio='16/9'; box.style.background='#000'; const iframe = document.createElement('iframe'); iframe.width='100%'; iframe.height='100%'; iframe.src = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`; iframe.allow = 'autoplay; fullscreen; picture-in-picture'; box.appendChild(iframe); const close = document.createElement('button'); close.textContent='✖'; close.style.position='absolute'; close.style.right='20px'; close.style.top='20px'; close.style.zIndex='10000'; close.style.padding='8px 10px'; close.addEventListener('click', ()=>{ document.body.removeChild(overlay); }); overlay.appendChild(box); overlay.appendChild(close); document.body.appendChild(overlay); }

// meta helpers
async function putMeta(k,v){ await put('meta',{k, v}); }
async function getMeta(k){ return new Promise(res=>{ const req = db.transaction('meta','readonly').objectStore('meta').get(k); req.onsuccess = ()=>res(req.result?req.result.v:null); req.onerror = ()=>res(null); }); }

async function saveMeta(k,v){ await put('meta',{k, v}); }
async function loadMeta(k){ return new Promise(res=>{ const req = db.transaction('meta','readonly').objectStore('meta').get(k); req.onsuccess = ()=>res(req.result?req.result.v:null); req.onerror = ()=>res(null); }); }

async function loadMetaIntoMemory(){ const vol = await loadMeta('volume'); if(vol!=null){ video.volume = vol; document.getElementById('volume').value = vol; } else { document.getElementById('volume').value = video.volume || 1; } }

// restore last session
async function restoreLastSession(){ const q = await loadMeta('queue'); if(q) { queue.splice(0, queue.length, ...q); } const last = await loadMeta('last'); if(last && last.index!=null){ await renderQueue(); playIndex(last.index); } await renderQueue(); }

// playlists
async function createPlaylist(){ const name = document.getElementById('newPlaylistName').value.trim(); if(!name) return; const pl = { id:id(), name, items:[], created:Date.now() }; await put('playlists',pl); document.getElementById('newPlaylistName').value=''; await renderPlaylists(); }

async function renderPlaylists(){ const pls = await getAll('playlists'); const el = document.getElementById('playlistsUL'); el.innerHTML=''; pls.forEach(p=>{ const li = document.createElement('li'); li.style.padding='6px'; li.style.border='1px solid #f1f3f5'; li.style.borderRadius='8px'; li.style.marginBottom='6px'; const name = document.createElement('div'); name.textContent = p.name; const btns = document.createElement('div'); btns.style.marginTop='6px'; const open = document.createElement('button'); open.textContent='Open'; open.addEventListener('click', ()=>openPlaylistEditor(p.id)); const play = document.createElement('button'); play.textContent='Play'; play.addEventListener('click', ()=>{ queue.splice(0,queue.length,...p.items); saveMeta('queue',queue); renderQueue(); playIndex(0); }); btns.appendChild(open); btns.appendChild(play); li.appendChild(name); li.appendChild(btns); el.appendChild(li); }); }

async function openPlaylistEditor(id){ const p = await new Promise(res=>{ const req = db.transaction('playlists','readonly').objectStore('playlists').get(id); req.onsuccess = ()=>res(req.result); }); const editor = document.getElementById('playlistEditor'); editor.innerHTML=''; const h = document.createElement('h3'); h.textContent = p.name; const list = document.createElement('ul'); list.style.listStyle='none'; list.style.padding=0; p.items.forEach((it, idx)=>{ const li = document.createElement('li'); li.style.display='flex'; li.style.justifyContent='space-between'; li.style.padding='6px'; li.style.border='1px solid #f1f3f5'; li.style.marginBottom='6px'; li.textContent = (idx+1)+'. '+it.name; list.appendChild(li); }); const addSel = document.createElement('button'); addSel.textContent='Add selected (from queue)'; addSel.addEventListener('click', async ()=>{ p.items = p.items.concat(queue.map(q=>({id:q.id,name:q.name,type:q.type,url:q.url}))); await put('playlists',p); openPlaylistEditor(id); renderPlaylists(); }); editor.appendChild(h); editor.appendChild(list); editor.appendChild(addSel); }

// settings export/import/reset
async function exportData(){ const files = await getAll('files'); const pls = await getAll('playlists'); const metaReq = await getAll('meta'); const payload = { files: files.map(f=>({id:f.id,name:f.name,size:f.size,type:f.type,added:f.added,duration:f.duration,width:f.width,height:f.height,thumbnail:f.thumbnail,lastPosition:f.lastPosition||0})), playlists:pls, meta: metaReq }; const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='media-player-export.json'; a.click(); URL.revokeObjectURL(url); }

async function importData(e){ const f = e.target.files[0]; if(!f) return; const text = await f.text(); const data = JSON.parse(text); if(data.playlists) for(const p of data.playlists) await put('playlists',p); if(data.meta) for(const m of data.meta) await put('meta',m); alert('Imported playlists & metadata. Local blobs not included — re-add local files if needed.'); await renderPlaylists(); await renderLibrary(); }

async function resetData(){ if(!confirm('Reset all data? This will clear library, playlists, settings.')) return; db.close(); const del = indexedDB.deleteDatabase(dbName); del.onsuccess = ()=> location.reload(); }

// subtitles upload
function onSubUpload(e){ const f = e.target.files[0]; if(!f) return; const reader = new FileReader(); reader.onload = ()=>{ const vtt = reader.result; const blob = new Blob([vtt], {type:'text/vtt'}); const url = URL.createObjectURL(blob); const existing = document.querySelectorAll('#video track'); existing.forEach(t=>t.remove()); const tr = document.createElement('track'); tr.kind='subtitles'; tr.label = f.name; tr.src = url; tr.default = true; document.getElementById('video').appendChild(tr); setTimeout(()=>{ const select = document.getElementById('subTracks'); select.innerHTML = '<option value="">No subtitles</option>'; for(let i=0;i<video.textTracks.length;i++){ const t = video.textTracks[i]; const opt = document.createElement('option'); opt.value = i; opt.textContent = t.label || ('Track '+(i+1)); select.appendChild(opt); } },500); }; reader.readAsText(f); }

// visualizer & EQ
function setupVisualizer(){ try{ audioCtx = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; const freqs = [60, 230, 910, 3600, 14000]; eqNodes = freqs.map(f=>{ const g = audioCtx.createBiquadFilter(); g.type = 'peaking'; g.frequency.value = f; g.Q.value = 1; g.gain.value = 0; return g; }); drawVisualizer(); }catch(e){ console.warn('WebAudio not available', e); } }

function connectAudioNodes(){ try{ if(!audioCtx) setupVisualizer(); if(!audioCtx) return; if(sourceNode) try{ sourceNode.disconnect(); }catch(e){} sourceNode = audioCtx.createMediaElementSource(video); let node = sourceNode; eqNodes.forEach(n=>{ node.connect(n); node = n; }); node.connect(analyser); analyser.connect(audioCtx.destination); }catch(e){ console.warn('connect audio failed', e); } }

function drawVisualizer(){ const canvas = document.getElementById('visualizer'); const ctx = canvas.getContext('2d'); function resize(){ canvas.width = canvas.clientWidth; canvas.height = canvas.clientHeight; } resize(); window.addEventListener('resize', resize); const data = new Uint8Array(analyser.frequencyBinCount); function loop(){ requestAnimationFrame(loop); if(!analyser) return; analyser.getByteFrequencyData(data); ctx.clearRect(0,0,canvas.width,canvas.height); const barWidth = canvas.width / data.length; for(let i=0;i<data.length;i++){ const v = data[i]/255; const h = v * canvas.height; ctx.fillStyle = `rgba(59,130,246,${v})`; ctx.fillRect(i*barWidth, canvas.height - h, barWidth*0.9, h); } } loop(); }

// EQ panel build
document.getElementById('eqBtn').addEventListener('click', ()=>{ const panel = document.getElementById('eqPanel'); const container = document.getElementById('eqSliders'); container.innerHTML=''; const freqs = [60, 230, 910, 3600, 14000]; freqs.forEach((f, idx)=>{ const row = document.createElement('div'); row.style.marginBottom='8px'; const label = document.createElement('div'); label.textContent = f+' Hz'; const input = document.createElement('input'); input.type='range'; input.min=-12; input.max=12; input.value=0; input.step=0.5; input.addEventListener('input', ()=>{ if(eqNodes[idx]) eqNodes[idx].gain.value = parseFloat(input.value); }); row.appendChild(label); row.appendChild(input); container.appendChild(row); }); panel.classList.remove('hidden'); });
document.getElementById('closeEq').addEventListener('click', ()=>document.getElementById('eqPanel').classList.add('hidden'));

// keyboard shortcuts
function bindKeyboardShortcuts(){ document.addEventListener('keydown', e=>{ if(e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return; if(e.code==='Space'){ e.preventDefault(); if(video.paused) video.play(); else video.pause(); } if(e.code==='ArrowLeft'){ video.currentTime = Math.max(0, video.currentTime - 5); } if(e.code==='ArrowRight'){ video.currentTime = Math.min(video.duration||0, video.currentTime + 5); } if(e.code==='ArrowUp'){ video.volume = Math.min(1, video.volume + 0.05); document.getElementById('volume').value = video.volume; saveMeta('volume', video.volume); } if(e.code==='ArrowDown'){ video.volume = Math.max(0, video.volume - 0.05); document.getElementById('volume').value = video.volume; saveMeta('volume', video.volume); } if(e.code==='KeyN'){ nextTrack(); } if(e.code==='KeyP'){ prevTrack(); } if(e.code==='KeyS'){ shuffle=!shuffle; document.getElementById('shuffleBtn').style.opacity = shuffle?1:0.6; } }); }

// next/prev
function nextTrack(){ if(repeatMode==='one'){ playIndex(currentIndex); return; } if(shuffle){ const next = Math.floor(Math.random()*queue.length); playIndex(next); return; } let next = currentIndex+1; if(next>=queue.length){ if(repeatMode==='all') next=0; else return; } playIndex(next); }
function prevTrack(){ if(video.currentTime>3) video.currentTime=0; else playIndex(Math.max(0,currentIndex-1)); }

document.getElementById('nextBtn').addEventListener('click', nextTrack);
document.getElementById('prevBtn').addEventListener('click', prevTrack);

// save queue as playlist
async function saveQueueAsPlaylist(){ const name = prompt('Playlist name?'); if(!name) return; const pl = { id:id(), name, items: queue.map(q=>({id:q.id,name:q.name,type:q.type,url:q.url})), created:Date.now() }; await put('playlists', pl); renderPlaylists(); }

// save/load meta
async function saveMeta(k,v){ await put('meta',{k, v}); }
async function loadMeta(k){ return new Promise(res=>{ const req = db.transaction('meta','readonly').objectStore('meta').get(k); req.onsuccess = ()=>res(req.result?req.result.v:null); req.onerror = ()=>res(null); }); }

// load queue from meta on start
async function renderQueueOnLoad(){ const q = await loadMeta('queue'); if(q) { queue.splice(0, queue.length, ...q); } renderQueue(); }
renderQueueOnLoad();

// small helpers
function formatTimeShort(s){ return formatTime(s); }
function formatTime(s){ if(!s || isNaN(s) || !isFinite(s)) return '00:00'; const m=Math.floor(s/60).toString().padStart(2,'0'); const sec=Math.floor(s%60).toString().padStart(2,'0'); return `${m}:${sec}`; }

// load initial UI
async function loadInitial(){ await renderLibrary(); await renderPlaylists(); }
loadInitial();
