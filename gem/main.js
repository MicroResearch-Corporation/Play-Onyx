import { db } from './storage/db.js';
import { initTabs } from './ui/tabs.js';
import { initControls } from './ui/controls.js';
import { initLibrary } from './ui/library.js';
import { initYouTubeTab } from './ui/youtube-tab.js'; // NEW
import { player } from './core/player.js';

function startVisualizer() {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    
    function draw() {
        requestAnimationFrame(draw);
        canvas.width = canvas.parentElement.offsetWidth;
        canvas.height = 80;
        
        const data = player.getVisualizerData();
        const barWidth = (canvas.width / data.length) * 0.8;
        let x = 0;
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for(let i = 0; i < data.length; i++) {
            const barHeight = (data[i] / 255) * canvas.height;
            ctx.fillStyle = `rgba(187, 134, 252, ${data[i]/255})`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 3;
        }
    }
    draw();
}

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Storage
    await db.init();
    
    // 2. Core Player Init (pass video ID)
    player.init('local-video');

    // 3. UI Modules
    initTabs();
    initControls();
    initLibrary();
    initYouTubeTab(); // NEW
    
    // 4. Visuals
    startVisualizer();
    
    // 5. Video Buttons (PiP/Fullscreen)
    document.getElementById('btn-pip').onclick = () => player.togglePiP();
    document.getElementById('btn-fullscreen').onclick = () => player.toggleFullscreen();

    console.log("MediaOS Ultimate Ready");
});