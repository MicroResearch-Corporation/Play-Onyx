import { DB } from './db.js';
import { UI } from './ui.js';

export const Player = (() => {
  let videoEl;
  let currentMediaId = null;

  function init() {
    videoEl = document.getElementById('video-player');

    videoEl.addEventListener('timeupdate', () => {
      if (currentMediaId) {
        DB.put('playbackProgress', {
          mediaId: currentMediaId,
          position: videoEl.currentTime
        });
      }
      UI.updateSeekBar(videoEl.currentTime, videoEl.duration);
    });

    videoEl.addEventListener('loadedmetadata', () => {
      UI.updateSeekBar(0, videoEl.duration);
    });

    UI.bindPlayerControls(videoEl, playPause);
  }

  async function loadMedia(media) {
    currentMediaId = media.id;
    if (media.origin === 'local') {
      videoEl.src = URL.createObjectURL(media.file);
    } else {
      videoEl.src = media.url;
    }

    const progress = await DB.get('playbackProgress', currentMediaId);
    if (progress) videoEl.currentTime = progress.position || 0;

    videoEl.play();
  }

  function playPause() {
    if (videoEl.paused) videoEl.play();
    else videoEl.pause();
  }

  return { init, loadMedia, playPause };
})();
