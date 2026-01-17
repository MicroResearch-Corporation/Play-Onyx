import { db } from '../storage/db.js';
import { player } from '../core/player.js';
import { queue } from '../core/queue.js';
import { toast } from './toasts.js';
import { generateUUID } from '../utils/helpers.js';

export function initLibrary() {
    const fileInput = document.getElementById('file-input');
    
    document.getElementById('btn-add-files').onclick = () => fileInput.click();
    document.getElementById('btn-delete-all').onclick = async () => {
        if(confirm("Delete all library files?")) {
            await db.clearFiles();
            renderLibrary();
            queue.clear();
        }
    };

    fileInput.onchange = async (e) => {
        const files = Array.from(e.target.files);
        let count = 0;
        for (const f of files) {
            // Simple name parsing
            let title = f.name.replace(/\.[^/.]+$/, "");
            let artist = 'Unknown Artist';
            if(title.includes('-')) {
                const parts = title.split('-');
                artist = parts[0].trim();
                title = parts[1].trim();
            }

            const track = {
                id: generateUUID(),
                title: title,
                artist: artist,
                file: f,
                type: f.type.startsWith('video') ? 'video' : 'audio',
                added: Date.now()
            };
            await db.addFile(track);
            queue.add(track); // Auto add to queue
            count++;
        }
        toast(`Added ${count} files`);
        renderLibrary();
    };

    renderLibrary();
}

export async function renderLibrary() {
    const list = document.getElementById('library-list');
    list.innerHTML = '';
    const files = await db.getAllFiles();

    if(files.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#666">Library is empty</div>';
        return;
    }

    files.forEach(track => {
        const div = document.createElement('div');
        div.className = 'track-item';
        div.innerHTML = `
            <div style="display:flex; flex-direction:column">
                <span style="font-weight:600">${track.title}</span>
                <span style="font-size:0.85em; color:#aaa">${track.artist}</span>
            </div>
            <span class="material-icons" style="opacity:0.5">play_circle</span>
        `;
        div.onclick = () => {
            player.play(track);
            // If playing from library, reset queue to start from here (simplified logic)
            // queue.setQueue(files); 
        };
        list.appendChild(div);
    });
}