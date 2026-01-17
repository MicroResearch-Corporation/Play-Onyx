
/*
 Runtime queue manager that uses indexedDB queue store as backing.
 Provides in-memory queue for playback and UI rendering.
*/
let QUEUE = []; // {id, type, name, src, meta}
let currentIndex = -1;
let shuffle = false;
let repeatMode = 'none'; // 'none', 'one', 'all'

async function loadQueue(){
  QUEUE = await getQueueItems();
  renderQueue();
}

function renderQueue(){
  const ul = document.getElementById('queue');
  ul.innerHTML = '';
  QUEUE.forEach((it, idx) => {
    const li = document.createElement('li');
    li.textContent = it.name || it.src || 'Untitled';
    li.dataset.idx = idx;
    if (idx === currentIndex) li.classList.add('playing');
    li.onclick = () => { playIndex(idx); };
    ul.appendChild(li);
  });
}

async function addFilesToQueue(files){
  for (const f of files){
    const url = URL.createObjectURL(f);
    const item = { type: f.type || 'audio', name: f.name, src: url, meta: {} };
    await addToQueueItem(item);
  }
  await loadQueue();
}

async function addUrlToQueue(url){
  const item = { type: 'url', name: url, src: url, meta: {} };
  await addToQueueItem(item);
  await loadQueue();
}

async function addYouTubeToQueue(videoId, title){
  const item = { type: 'youtube', name: title || ('YT:'+videoId), src: videoId, meta: {videoId}};
  await addToQueueItem(item);
  await loadQueue();
}

function nextIndex(){
  if (shuffle) return Math.floor(Math.random()*QUEUE.length);
  if (repeatMode === 'one') return currentIndex;
  const next = currentIndex + 1;
  if (next >= QUEUE.length) return (repeatMode === 'all' ? 0 : -1);
  return next;
}

function prevIndex(){
  const prev = currentIndex - 1;
  if (prev < 0) return -1;
  return prev;
}

async function playIndex(idx){
  if (idx < 0 || idx >= QUEUE.length) return;
  currentIndex = idx;
  renderQueue();
  const item = QUEUE[idx];
  await playQueueItem(item);
}

async function playNext(){
  const ni = nextIndex();
  if (ni === -1){ pauseMedia(); return; }
  await playIndex(ni);
}

async function playPrev(){
  const pi = prevIndex();
  if (pi === -1) return;
  await playIndex(pi);
}
