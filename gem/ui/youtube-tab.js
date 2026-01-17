import { player } from '../core/player.js';
import { queue } from '../core/queue.js';
import { db } from '../storage/db.js';
import { toast } from './toasts.js';

export function initYouTubeTab() {
    const btnLoad = document.getElementById('btn-load-yt');
    const input = document.getElementById('yt-input');
    const clearBtn = document.getElementById('btn-clear-yt-history');

    // 1. Play & Save
    btnLoad.onclick = async () => {
        const url = input.value;
        const id = extractVideoID(url);

        if (!id) {
            toast("Invalid YouTube URL");
            return;
        }

        const track = {
            id: id,
            title: `YouTube Video`,
            artist: 'Online Stream',
            type: 'youtube',
            date: Date.now()
        };

        // Add to Queue & Play
        queue.add(track);
        player.play(track);
        document.querySelector('[data-tab="player"]').click();

        // Save to History
        await db.addHistory(track);
        renderHistory();
        input.value = '';
    };

    // 2. Clear History
    clearBtn.onclick = async () => {
        if(confirm("Clear YouTube history?")) {
            await db.clearHistory();
            renderHistory();
        }
    };

    renderHistory();
}

function extractVideoID(url) {
    let id = null;
    if (url.includes('v=')) id = url.split('v=')[1].split('&')[0];
    else if (url.includes('youtu.be/')) id = url.split('youtu.be/')[1];
    return id;
}

async function renderHistory() {
    const list = document.getElementById('yt-history-list');
    list.innerHTML = '';
    
    // Get history and reverse (newest first)
    const history = await db.getHistory();
    history.sort((a, b) => b.date - a.date);

    if(history.length === 0) {
        list.innerHTML = '<div style="color:#666; font-size:0.9rem;">No history yet.</div>';
        return;
    }

    history.forEach(item => {
        const div = document.createElement('div');
        div.className = 'history-item';
        div.innerHTML = `
            <div>
                <span style="font-weight:600">Video: ${item.id}</span><br>
                <span class="history-date">${new Date(item.date).toLocaleDateString()}</span>
            </div>
            <span class="material-icons">play_arrow</span>
        `;
        div.onclick = () => {
            queue.add(item);
            player.play(item);
            document.querySelector('[data-tab="player"]').click();
        };
        list.appendChild(div);
    });
}