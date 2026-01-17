
let mediaEl = document.getElementById('av'); // can be video or audio element
let ytPlayer = null;
let usingYouTube = false;

openDB().then(async ()=>{
  await loadQueue();
  await loadLibraryUI();
  await loadPlaylistsUI();
  await applySettings();
  hookUI();
  attachMediaHandlers();
});

// UI hooks (tabs etc) are in ui.js, but player attaches controls
function hookUI(){
  document.getElementById('fileInput').addEventListener('change', async (e)=>{
    await addFilesToQueue(e.target.files);
    await loadLibraryFromFiles(e.target.files);
  });

  document.getElementById('addUrl').addEventListener('click', async ()=>{
    const url = document.getElementById('urlInput').value.trim();
    if (!url) return;
    await addUrlToQueue(url);
    await addToLibrary({type:'url', name:url, src:url});
    document.getElementById('urlInput').value='';
    await loadLibraryUI();
  });

  document.getElementById('addYt').addEventListener('click', async ()=>{
    const v = document.getElementById('ytUrl').value.trim();
    if (!v) return;
    const id = extractYouTubeId(v);
    if (!id) { alert('Invalid YouTube URL/ID'); return; }
    // naive title placeholder; real fetch would need CORS/YouTube Data API
    await addYouTubeToQueue(id, 'YouTube: '+id);
    document.getElementById('ytUrl').value='';
    await loadQueue();
  });

  document.getElementById('prevBtn').addEventListener('click', playPrev);
  document.getElementById('nextBtn').addEventListener('click', playNext);
  document.getElementById('playPauseBtn').addEventListener('click', ()=>{ if (!mediaPlaying()) playNext() ; else pauseMedia(); });
  document.getElementById('shuffleBtn').addEventListener('click', ()=>{ shuffle = !shuffle; document.getElementById('shuffleBtn').classList.toggle('active', shuffle); });
  document.getElementById('repeatBtn').addEventListener('click', ()=>{ repeatMode = (repeatMode==='none'?'all': repeatMode==='all'?'one':'none'); document.getElementById('repeatBtn').textContent = repeatMode==='none'?'🔁': repeatMode==='all'?'🔁':'🔂'; });

  document.getElementById('addToQueue').addEventListener('click', async ()=>{
    // add selected files in input to queue
    const files = document.getElementById('fileInput').files;
    if (files.length) { await addFilesToQueue(files); }
  });

  // settings actions
  document.getElementById('exportData').addEventListener('click', async ()=>{
    const data = await exportData();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'media-player-export.json'; a.click();
    URL.revokeObjectURL(url);
  });
  document.getElementById('importData').addEventListener('click', ()=> document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', async (e)=>{
    const f = e.target.files[0]; if (!f) return;
    const obj = JSON.parse(await f.text());
    await importData(obj);
    await loadQueue(); await loadLibraryUI(); await loadPlaylistsUI();
    alert('Imported data.');
  });
  document.getElementById('resetData').addEventListener('click', async ()=>{
    if (!confirm('Reset all data?')) return;
    await resetAll();
    location.reload();
  });

  // playlist create/save/delete hooks
  document.getElementById('createPlaylist').addEventListener('click', async ()=>{
    const name = document.getElementById('playlistName').value.trim(); if (!name) return alert('Enter name');
    // create empty playlist
    await savePlaylist(name, []); await loadPlaylistsUI();
    document.getElementById('playlistName').value='';
  });
  document.getElementById('savePlaylistBtn').addEventListener('click', async ()=>{
    const title = document.getElementById('plEditorTitle').dataset.name;
    if (!title) return alert('Select a playlist');
    const items = Array.from(document.querySelectorAll('#plEditorItems li')).map(li=>JSON.parse(li.dataset.item));
    await savePlaylist(title, items); alert('Saved');
    await loadPlaylistsUI();
  });
  document.getElementById('deletePlaylistBtn').addEventListener('click', async ()=>{
    const title = document.getElementById('plEditorTitle').dataset.name;
    if (!title) return alert('Select a playlist');
    if (!confirm('Delete playlist '+title+'?')) return;
    await deletePlaylist(title); await loadPlaylistsUI();
  });

  // accent color and theme
  document.getElementById('accentColor').addEventListener('input', (e)=>{
    document.documentElement.style.setProperty('--accent', e.target.value);
    saveSetting('accent', e.target.value);
  });
  document.getElementById('themeSelect').addEventListener('change', (e)=>{
    saveSetting('theme', e.target.value); applySettings();
  });

  // keyboard shortcuts
  window.addEventListener('keydown', (e)=>{
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space'){ e.preventDefault(); togglePlay(); }
    if (e.key === 'ArrowRight'){ seekBy(5); }
    if (e.key === 'ArrowLeft'){ seekBy(-5); }
    if (e.key === 'ArrowUp'){ changeVolume(0.05); }
    if (e.key === 'ArrowDown'){ changeVolume(-0.05); }
    if (e.key.toLowerCase() === 'n'){ playNext(); }
    if (e.key.toLowerCase() === 'p'){ playPrev(); }
    if (e.key.toLowerCase() === 's'){ shuffle = !shuffle; document.getElementById('shuffleBtn').classList.toggle('active', shuffle); }
    if (e.key.toLowerCase() === 'r'){ repeatMode = (repeatMode==='none'?'all': repeatMode==='all'?'one':'none'); }
  });
}

function attachMediaHandlers(){
  // generic handlers for AV element
  const seek = document.getElementById('seek');
  mediaEl = document.getElementById('av');
  mediaEl.addEventListener('timeupdate', ()=>{
    const cur = mediaEl.currentTime || 0;
    const dur = mediaEl.duration || 0;
    document.getElementById('currentTime').textContent = fmtTime(cur);
    document.getElementById('duration').textContent = fmtTime(dur);
    if (dur) seek.value = Math.floor((cur/dur)*100);
  });
  seek.addEventListener('input', ()=>{
    if (!mediaEl.duration) return;
    mediaEl.currentTime = (seek.value/100)*mediaEl.duration;
  });
  mediaEl.addEventListener('ended', async ()=>{
    await playNext();
  });
  mediaEl.addEventListener('play', ()=>{ updatePlayButton(true); updateMediaSession(); });
  mediaEl.addEventListener('pause', ()=>{ updatePlayButton(false); updateMediaSession(); });

  // initial load of queue
  // Media Session handlers
  if ('mediaSession' in navigator){
    navigator.mediaSession.setActionHandler('play', ()=> togglePlay());
    navigator.mediaSession.setActionHandler('pause', ()=> pauseMedia());
    navigator.mediaSession.setActionHandler('nexttrack', ()=> playNext());
    navigator.mediaSession.setActionHandler('previoustrack', ()=> playPrev());
    navigator.mediaSession.playbackState = 'none';
  }
}

function updatePlayButton(isPlaying){
  document.getElementById('playPauseBtn').textContent = isPlaying ? '❚❚' : '▶';
}

function fmtTime(t){ if (!t || isNaN(t)) return '0:00'; const m = Math.floor(t/60); const s = Math.floor(t%60).toString().padStart(2,'0'); return m+':'+s; }
function mediaPlaying(){ return !mediaEl.paused && !mediaEl.ended; }
function togglePlay(){ if (usingYouTube){ if (ytPlayer){ const state = ytPlayer.getPlayerState(); if (state === 1) ytPlayer.pauseVideo(); else ytPlayer.playVideo(); } } else { if (mediaEl.paused) mediaEl.play(); else mediaEl.pause(); } }

function pauseMedia(){ if (usingYouTube && ytPlayer) ytPlayer.pauseVideo(); else mediaEl.pause(); }

function seekBy(sec){ try{ if (usingYouTube && ytPlayer){ const cur = ytPlayer.getCurrentTime(); ytPlayer.seekTo(Math.max(0, cur+sec), true); } else { mediaEl.currentTime = Math.max(0, (mediaEl.currentTime||0)+sec); } }catch(e){} }
function changeVolume(delta){ try{ if (usingYouTube && ytPlayer){ /* youtube volume control via API */ const vol = ytPlayer.getVolume(); ytPlayer.setVolume(Math.max(0, Math.min(100, vol + delta*100))); } else { mediaEl.volume = Math.max(0, Math.min(1, (mediaEl.volume||1)+delta)); } }catch(e){} }

// play queue item - supports types: audio/video (HTML5), url, youtube
async function playQueueItem(item){
  usingYouTube = false;
  // update UI title/cover
  document.getElementById('title').textContent = item.name || 'Untitled';
  document.getElementById('artist').textContent = item.meta && item.meta.artist ? item.meta.artist : (item.type || '');
  if (item.meta && item.meta.cover) document.getElementById('cover').src = item.meta.cover; else document.getElementById('cover').src = '';

  if (item.type === 'youtube' || (item.meta && item.meta.videoId)){
    // destroy any HTML5 element and create YouTube iframe player
    usingYouTube = true;
    createYouTubePlayer(item.meta.videoId);
    updateMediaSession(item);
    return;
  }

  // otherwise use HTML5 element
  if (usingYouTube && ytPlayer){ // remove youtube player
    const wrapper = document.getElementById('ytPlayerWrapper');
    wrapper.innerHTML = '';
    ytPlayer = null;
    usingYouTube = false;
  }
  ensureMediaElement();
  mediaEl.src = item.src;
  try{ await mediaEl.play(); }catch(e){ console.warn('play failed', e); }
  updateMediaSession(item);
  renderQueue(); // highlight playing
}

function ensureMediaElement(){
  const container = document.getElementById('mediaContainer');
  let el = container.querySelector('video,audio');
  if (!el){
    container.innerHTML = '<video id="av" controls preload="metadata"></video>';
    el = container.querySelector('#av');
    mediaEl = el;
    attachMediaHandlers(); // reattach
  } else {
    mediaEl = el;
  }
}

// YouTube iframe integration
function createYouTubePlayer(videoId){
  const wrapper = document.getElementById('ytPlayerWrapper');
  wrapper.innerHTML = '<div id="ytPlayer"></div>';
  ytPlayer = new YT.Player('ytPlayer', {
    height: '390', width: '640', videoId: videoId,
    playerVars: { 'playsinline': 1 },
    events: {
      'onStateChange': function(e){
        // 0 ended, 1 playing, 2 paused
        if (e.data === 0) playNext();
        if (e.data === 1) updatePlayButton(true);
        if (e.data === 2) updatePlayButton(false);
      }
    }
  });
  // move wrapper into mediaContainer for layout
  const container = document.getElementById('mediaContainer');
  container.innerHTML = '';
  container.appendChild(wrapper);
}

// update media session metadata based on current item
function updateMediaSession(item){
  try{
    if (!('mediaSession' in navigator)) return;
    const metadata = new MediaMetadata({
      title: item && (item.name || item.src) || 'Web Media Player',
      artist: item && item.meta && item.meta.artist || '',
      album: item && item.meta && item.meta.album || '',
      artwork: (item && item.meta && item.meta.cover) ? [{src:item.meta.cover, sizes:'512x512', type:'image/png'}] : []
    });
    navigator.mediaSession.metadata = metadata;
    navigator.mediaSession.playbackState = mediaPlaying() ? 'playing' : 'paused';
  }catch(e){}
}

// utility: load library UI
async function loadLibraryFromFiles(files){
  for (const f of files){ await addToLibrary({type: f.type || 'audio', name: f.name, src: URL.createObjectURL(f), meta:{size:f.size}}); }
  await loadLibraryUI();
}
async function loadLibraryUI(){
  const list = document.getElementById('libraryList');
  list.innerHTML = '';
  const items = await getLibrary();
  for (const it of items){
    const li = document.createElement('li');
    li.textContent = it.name;
    li.onclick = async ()=>{ await addToQueueItem(it); await loadQueue(); };
    list.appendChild(li);
  }
}

// playlists UI
async function loadPlaylistsUI(){
  const ul = document.getElementById('playlistList'); ul.innerHTML='';
  const pls = await getPlaylists();
  for (const p of pls){
    const li = document.createElement('li'); li.textContent = p.name;
    li.onclick = async ()=>{ document.getElementById('plEditorTitle').textContent = 'Editing: '+p.name; document.getElementById('plEditorTitle').dataset.name = p.name; renderPlaylistEditor(p.items || []); };
    ul.appendChild(li);
  }
}
function renderPlaylistEditor(items){
  const ed = document.getElementById('plEditorItems'); ed.innerHTML='';
  for (const it of items){
    const li = document.createElement('li'); li.textContent = it.name || it.src || 'Item';
    li.dataset.item = JSON.stringify(it);
    li.onclick = async ()=>{ // add to queue
      await addToQueueItem(it); await loadQueue();
    };
    ed.appendChild(li);
  }
}

// helper to render queue highlight
function renderQueue(){
  const ul = document.getElementById('queue');
  ul.innerHTML = '';
  for (let i=0;i<QUEUE.length;i++){
    const it = QUEUE[i];
    const li = document.createElement('li'); li.textContent = (i+1)+'. '+(it.name || it.src);
    if (i===currentIndex) li.classList.add('playing');
    li.onclick = ()=> playIndex(i);
    ul.appendChild(li);
  }
}

// extract youtube id naive
function extractYouTubeId(input){
  try{
    if (input.includes('youtube.com') || input.includes('youtu.be')){
      const u = new URL(input.includes('http')?input:'https://'+input);
      if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
      const p = u.searchParams.get('v'); if (p) return p;
      // playlist handling ignored for now
    }
    // maybe user passed ID directly
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  }catch(e){}
  return null;
}

// settings application
async function applySettings(){
  const accent = await getSetting('accent') || '#4caf50';
  document.documentElement.style.setProperty('--accent', accent);
  document.getElementById('accentColor').value = accent;
  const theme = await getSetting('theme') || 'auto';
  document.getElementById('themeSelect').value = theme;
  if (theme === 'dark') document.documentElement.style.setProperty('--bg','#0b0b0b');
  else if (theme === 'light') document.documentElement.style.setProperty('--bg','#f7f7f7');
  else document.documentElement.style.removeProperty('--bg');
}
