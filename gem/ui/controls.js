import { player } from '../core/player.js';
import { queue } from '../core/queue.js';
import { events } from '../core/events.js';
import { formatTime } from '../utils/helpers.js';
import { ytProvider } from '../providers/youtube.js';

export function initControls() {
    // Buttons
    const btnPlay = document.getElementById('btn-play');
    const seek = document.getElementById('seek-bar');
    const vol = document.getElementById('volume-bar');

    btnPlay.onclick = () => player.togglePlay();
    document.getElementById('btn-next').onclick = () => {
        const next = queue.getNext(player.currentTrack);
        if(next) player.play(next);
    };
    document.getElementById('btn-prev').onclick = () => {
        const prev = queue.getPrevious(player.currentTrack);
        if(prev) player.play(prev);
    };

    seek.oninput = (e) => player.seek(e.target.value);
    vol.oninput = (e) => player.audio.volume = e.target.value;

    // YouTube Input
    document.getElementById('btn-load-yt').onclick = () => {
        const url = document.getElementById('yt-input').value;
        let id = null;
        try {
            if(url.includes('v=')) id = url.split('v=')[1].split('&')[0];
            else if(url.includes('youtu.be/')) id = url.split('youtu.be/')[1];
            
            if(id) {
                const track = {
                    id: id,
                    title: 'YouTube Stream',
                    artist: 'YouTube',
                    type: 'youtube'
                };
                queue.add(track);
                player.play(track);
                document.querySelector('[data-tab="player"]').click();
            }
        } catch(e) { alert("Invalid URL"); }
    };

    // Events
    events.on('playback:playing', () => {
        btnPlay.innerHTML = '<span class="material-icons">pause</span>';
        document.querySelector('.art-wrapper').style.transform = 'scale(1.02)';
    });
    
    events.on('playback:paused', () => {
        btnPlay.innerHTML = '<span class="material-icons">play_arrow</span>';
        document.querySelector('.art-wrapper').style.transform = 'scale(1)';
    });

    events.on('timeupdate', ({current, total}) => {
        document.getElementById('time-current').innerText = formatTime(current);
        document.getElementById('time-total').innerText = formatTime(total);
        if(!isNaN(current/total)) {
            seek.value = (current / total) * 100;
        }
    });

    events.on('track:change', (track) => {
        document.getElementById('track-title').innerText = track.title;
        document.getElementById('track-artist').innerText = track.artist;
        document.getElementById('pb-title').innerText = `${track.title} • ${track.artist}`;
        
        // Highlights in list
        document.querySelectorAll('.track-item').forEach(el => el.classList.remove('playing'));
    });

    // Queue UI
    events.on('queue:updated', (list) => {
        const container = document.getElementById('queue-list');
        container.innerHTML = '';
        list.forEach(t => {
            const div = document.createElement('div');
            div.className = 'track-item';
            div.innerHTML = `<span>${t.title}</span>`;
            div.onclick = () => player.play(t);
            container.appendChild(div);
        });
    });
}