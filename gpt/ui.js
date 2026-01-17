import { DB } from './db.js';
import { Player } from './player.js';

export const UI = (() => {
  let playlistList, queueList, addFileBtn, addUrlBtn, createPlaylistBtn;

  function init() {
    playlistList = document.getElementById('playlist-list');
    queueList = document.getElementById('queue-list');
    addFileBtn = document.getElementById('add-file-btn');
    addUrlBtn = document.getElementById('add-url-btn');
    createPlaylistBtn = document.getElementById('create-playlist-btn');

    addFileBtn.addEventListener('click', addFile);
    addUrlBtn.addEventListener('click', addURL);
    createPlaylistBtn.addEventListener('click', createPlaylist);

    loadPlaylists();
  }

  async function loadPlaylists() {
    const playlists = await DB.getAll('playlists');
    playlistList.innerHTML = '';
    playlists.forEach(pl => {
      const li = document.createElement('li');
      li.textContent = pl.name;
      playlistList.appendChild(li);
    });
  }

  async function addFile() {
    const [fileHandle] = await window.showOpenFilePicker();
    const file = await fileHandle.getFile();
    const media = {
      id: crypto.randomUUID(),
      title: file.name,
      origin: 'local',
      file
    };
    await DB.put('media', media);
    Player.loadMedia(media);
  }

  async function addURL() {
    const url = prompt('Enter media URL:');
    if (!url) return;
    const media = {
      id: crypto.randomUUID(),
      title: url.split('/').pop(),
      origin: 'url',
      url
    };
    await DB.put('media', media);
    Player.loadMedia(media);
  }

  async function createPlaylist() {
    const name = prompt('Playlist name:');
    if (!name) return;
    const playlist = { id: crypto.randomUUID(), name, items: [] };
    await DB.put('playlists', playlist);
    loadPlaylists();
  }

  function bindPlayerControls(videoEl, playPauseFn) {
    document.getElementById('play-pause').addEventListener('click', playPauseFn);

    const seekBar = document.getElementById('seek-bar');
    seekBar.addEventListener('input', () => {
      videoEl.currentTime = (seekBar.value / 100) * videoEl.duration;
    });

    const volumeBar = document.getElementById('volume-bar');
    volumeBar.addEventListener('input', () => videoEl.volume = volumeBar.value);

    const rateSelect = document.getElementById('playback-rate');
    rateSelect.addEventListener('change', () => videoEl.playbackRate = rateSelect.value);
  }

  function updateSeekBar(current, total) {
    const seekBar = document.getElementById('seek-bar');
    seekBar.value = (current / total) * 100;
  }

  return { init, bindPlayerControls, updateSeekBar };
})();
