import { events } from '../core/events.js';
import { player } from '../core/player.js';
import { db } from '../storage/db.js';
import { formatTime, generateUUID } from '../utils/helpers.js';

export function initUI() {
    setupTabs();
    setupControls();
    setupLibrary();
    setupVisualizer();
}

function setupTabs() {
    const buttons = document.querySelectorAll('.nav-btn');
    const contents = document.querySelectorAll('.tab-content');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active
            buttons.forEach(b => b.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Add active
            btn.classList.add('active');
            const tabId = `tab-${btn.dataset.tab}`;
            document.getElementById(tabId).classList.add('active');
        });
    });
}

function setupControls() {
    const playBtn = document.getElementById('btn-play');
    const seekbar = document.getElementById('seek-bar');
    const volbar = document.getElementById('volume-bar');
    const ytBtn = document.getElementById('btn-load-yt');

    playBtn.addEventListener('click', () => player.togglePlay());
    
    seekbar.addEventListener('input', (e) => player.seek(e.target.value));
    
    volbar.addEventListener('input', (e) => player.setVolume(e.target.value));

    // YouTube Load
    ytBtn.addEventListener('click', () => {
        const input = document.getElementById('yt-input').value;
        // Extract ID (Simple regex)
        let vidId = input;
        if(input.includes('v=')) vidId = input.split('v=')[1].split('&')[0];
        if(input.includes('youtu.be/')) vidId = input.split('youtu.be/')[1];
        
        player.playYouTube(vidId);
        document.querySelector('[data-tab="player"]').click(); // Switch tab
    });

    // Update UI on events
    events.on('playback:playing', () => {
        playBtn.innerHTML = '<span class="material-icons">pause</span>';
    });

    events.on('playback:paused', () => {
        playBtn.innerHTML = '<span class="material-icons">play_arrow</span>';
    });

    events.on('timeupdate', (data) => {
        const pct = (data.current / data.total) * 100;
        if (!isNaN(pct)) seekbar.value = pct;
        document.getElementById('time-current').innerText = formatTime(data.current);
        document.getElementById('time-total').innerText = formatTime(data.total);
    });

    events.on('track:change', (meta) => {
        document.getElementById('track-title').innerText = meta.title;
        document.getElementById('track-artist').innerText = meta.artist;
        document.getElementById('pb-title').innerText = `${meta.artist} - ${meta.title}`;
    });
}

function setupLibrary() {
    const fileInput = document.getElementById('file-input');
    const addBtn = document.getElementById('btn-add-files');
    const clearBtn = document.getElementById('btn-clear-db');
    const list = document.getElementById('library-list');

    addBtn.addEventListener('click', () => fileInput.click());
    
    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (const f of files) {
            // In a real app, parse metadata here (ID3)
            const meta = {
                id: generateUUID(),
                title: f.name,
                artist: 'Local File',
                file: f,
                type: f.type
            };
            await db.addFile(meta);
        }
        renderLibrary();
    });

    clearBtn.addEventListener('click', async () => {
        await db.clearFiles();
        renderLibrary();
    });

    // Initial Render
    renderLibrary();
}

async function renderLibrary() {
    const list = document.getElementById('library-list');
    list.innerHTML = '';
    const files = await db.getAllFiles();

    files.forEach(item => {
        const div = document.createElement('div');
        div.className = 'track-item';
        div.innerHTML = `<span>${item.title}</span> <span>${item.artist}</span>`;
        div.onclick = () => {
            player.playLocal(item.file, item);
            document.querySelector('[data-tab="player"]').click();
        };
        list.appendChild(div);
    });
}

function setupVisualizer() {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    
    function draw() {
        requestAnimationFrame(draw);
        const data = player.getAnalyserData();
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--md-sys-color-primary');
        
        const barWidth = (canvas.width / data.length) * 2.5;
        let x = 0;

        for(let i = 0; i < data.length; i++) {
            const barHeight = data[i] / 2;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }
    draw();
}