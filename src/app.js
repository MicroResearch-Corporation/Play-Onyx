
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const uuid = () => Math.random().toString(36).substr(2, 9);
const formatTime = t => {
    if (!t || isNaN(t)) return "00:00";
    let m = Math.floor(t / 60), s = Math.floor(t % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
};

/* INDEXEDDB */
class Database {
    constructor() { this.name = "PlayOnyx"; this.ver = 1; this.db = null; }
    init() {
        return new Promise((res, rej) => {
            const req = indexedDB.open(this.name, this.ver);
            req.onupgradeneeded = e => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("media")) db.createObjectStore("media", { keyPath: "id" });
            };
            req.onsuccess = e => { this.db = e.target.result; res(); };
            req.onerror = e => rej(e);
        });
    }
    async add(file) {
        if (!this.db) await this.init();
        const item = {
            id: uuid(), name: file.name, type: file.type, size: file.size,
            blob: file, added: Date.now(), fav: false, thumb: null
        };
        return new Promise(res => {
            const tx = this.db.transaction("media", "readwrite");
            tx.objectStore("media").add(item);
            tx.oncomplete = () => res(item);
        });
    }
    async getAll() {
        if (!this.db) await this.init();
        return new Promise(res => {
            const tx = this.db.transaction("media", "readonly");
            tx.objectStore("media").getAll().onsuccess = e => res(e.target.result || []);
        });
    }
    async update(item) {
        if (!this.db) await this.init();
        this.db.transaction("media", "readwrite").objectStore("media").put(item);
    }
    async remove(id) {
        if (!this.db) await this.init();
        this.db.transaction("media", "readwrite").objectStore("media").delete(id);
    }
}

/* LOCALSTORAGE */
const store = {
    state: {
        theme: 'dark', volume: 1, loop: false, shuffle: false, eq: { low: 0, mid: 0, high: 0 },
        queue: [], activeTab: 'library',
        vidFilters: { brightness: 1, contrast: 1, saturate: 1, hue: 0 }
    },
    load() {
        const local = localStorage.getItem("PlayOnyx_Settings");
        if (local) this.state = { ...this.state, ...JSON.parse(local) };
        document.body.setAttribute("data-theme", this.state.theme);
        const vSlider = $("#vol-slider");
        if (vSlider) vSlider.value = this.state.volume;
        return this.state;
    },
    save() {
        if (this._timer) clearTimeout(this._timer);
        this._timer = setTimeout(() => localStorage.setItem("PlayOnyx_Settings", JSON.stringify(this.state)), 500);
    }
};

/* APP LOGIC */
const settings = {
    export: () => {
        const blob = new Blob([JSON.stringify(store.state)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "PlayOnyx_Settings.json";
        a.click();
        app.toast("Config exported");
    },
    import: (el) => {
        const file = el.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const config = JSON.parse(e.target.result);
                store.state = { ...store.state, ...config };
                store.save();
                location.reload();
            } catch (err) { app.toast("Invalid Config File"); }
        };
        reader.readAsText(file);
    },
    reset: () => {
        if (confirm("Reset all settings to default? Library will persist.")) {
            localStorage.removeItem("PlayOnyx_Settings");
            location.reload();
        }
    }
};

const app = {
    db: new Database(),
    items: [],

    init: async () => {
        const cfg = store.load();
        try {
            await app.db.init();
            await app.refreshLib();
        } catch (e) {
            console.error("DB Init Failed", e);
            app.toast("Database Error: Check Console");
        }

        ui.setup();
        audio.init();

        if (cfg.queue && cfg.queue.length > 0) {
            queue.list = cfg.queue.map(qid => app.items.find(i => i.id === qid)).filter(item => item);
            queue.render();
        }

        window.history.replaceState({}, "", window.location.pathname);
        ui.resetPlayer();

        app.nav(cfg.activeTab);

        document.ondragover = e => e.preventDefault();
        const sb = $('.nav-rail');
        if (sb) {
            sb.ondragover = e => { e.preventDefault(); };
            sb.ondrop = async e => {
                e.preventDefault();
                if (e.dataTransfer.files.length) await app.processFiles(e.dataTransfer.files);
            };
        }

        const dz = $('#drop-zone');
        if (dz) {
            dz.ondragover = e => {
                e.preventDefault();
                dz.classList.add('drag-active');
            };
            dz.ondragleave = e => {
                dz.classList.remove('drag-active');
            };
            dz.ondrop = async e => {
                e.preventDefault();
                dz.classList.remove('drag-active');
                if (e.dataTransfer.files.length) await app.processFiles(e.dataTransfer.files);
            };
        }
    },

    clearDB: async () => {
        if (confirm("Permanently delete ALL media files? Settings will be kept.")) {
            store.state.queue = [];
            store.save();
            if (app.db.db) { app.db.db.close(); app.db.db = null; }
            const req = indexedDB.deleteDatabase("PlayOnyx5");
            req.onsuccess = () => location.reload();
            req.onerror = () => { alert("Error deleting. Close other tabs."); location.reload(); };
        }
    },

    nav: (tab) => {
        store.state.activeTab = tab;
        store.save();

        $$(".nav-item").forEach(n => n.classList.remove("active"));
        const btn = $(`.nav-item[data-tab="${tab}"]`);
        if (btn) btn.classList.add("active");

        $$(".view-section").forEach(el => el.classList.remove("active"));
        if (tab === 'playing') {
            $("#view-player").classList.add("active");
        } else {
            $("#view-library").classList.add("active");
            let list = app.items;
            let title = "Library";
            if (tab === 'audio') { list = app.items.filter(i => i.type.startsWith('audio')); title = "Audio"; }
            if (tab === 'video') { list = app.items.filter(i => i.type.startsWith('video')); title = "Video"; }
            if (tab === 'favorites') { list = app.items.filter(i => i.fav); title = "Favorites"; }
            $("#lib-title").innerText = title;
            ui.renderGrid(list);
        }
    },

    handleFiles: (el) => app.processFiles(el.files),

    processFiles: async (files) => {
        app.toast(`Importing ${files.length} items...`);
        for (let f of files) await app.db.add(f);
        await app.refreshLib();
        app.toast("Import Complete");
        if (app.items.length === files.length) {
            player.load(app.items[0]);
            queue.add(app.items[0]);
            app.nav('playing');
        }
    },

    refreshLib: async () => {
        app.items = await app.db.getAll();
        $("#lib-count").innerText = app.items.length;
        if (store.state.activeTab !== 'playing') app.nav(store.state.activeTab);
    },

    toggleTheme: () => {
        const n = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
        document.body.setAttribute("data-theme", n);
        store.state.theme = n;
        store.save();
    },

    toggleFav: async (id, e) => {
        if (e) e.stopPropagation();
        const item = app.items.find(i => i.id === id);
        if (item) {
            item.fav = !item.fav;
            await app.db.update(item);
            app.refreshLib();
        }
    },

    removeMedia: async (id) => {
        if (confirm("Delete this file?")) {
            await app.db.remove(id);
            const qIdx = queue.list.findIndex(i => i.id === id);
            if (qIdx > -1) queue.remove(qIdx, { stopPropagation: () => { } });
            app.refreshLib();
        }
    },

    openModal: (id) => {
        app.closeModal(null, true);
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('open');
            if (id === 'meta-modal') {
                if (!player.active) { $("#meta-body").innerHTML = "No Active File"; return; }
                const i = player.active;
                $("#meta-body").innerHTML = `
                    <strong>File:</strong> ${i.name}<br>
                    <strong>Size:</strong> ${(i.size / 1048576).toFixed(2)} MB<br>
                    <strong>Type:</strong> ${i.type}<br>
                    <hr style="border:0; border-top:1px solid var(--md-sys-color-outline); opacity:0.3; margin:10px 0">
                    <strong>Res:</strong> ${player.el.videoWidth || 'N/A'} x ${player.el.videoHeight || 'N/A'}<br>
                    <strong>Dur:</strong> ${player.el.duration ? player.el.duration.toFixed(2) : 0}s
                `;
            }
        }
    },
    closeModal: (e, force) => {
        if (force || e.target.classList.contains('modal-mask') || e.target.classList.contains('close-modal')) {
            $$('.modal-mask').forEach(m => m.classList.remove('open'));
        }
    },
    toast: (msg) => {
        const t = $("#toast");
        t.innerText = msg;
        t.classList.add("show");
        setTimeout(() => t.classList.remove("show"), 3000);
    }
};

/* AUDIO SYSTEM */
const audio = {
    ctx: null, source: null,
    init: () => {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            audio.ctx = new AC();
            audio.analyser = audio.ctx.createAnalyser();
            audio.analyser.fftSize = 256;

            audio.bands = {
                low: audio.ctx.createBiquadFilter(),
                mid: audio.ctx.createBiquadFilter(),
                high: audio.ctx.createBiquadFilter()
            };
            audio.bands.low.type = "lowshelf"; audio.bands.low.frequency.value = 320;
            audio.bands.mid.type = "peaking"; audio.bands.mid.frequency.value = 1000;
            audio.bands.high.type = "highshelf"; audio.bands.high.frequency.value = 3200;

            const st = store.state.eq;
            audio.setEq('low', st.low); audio.setEq('mid', st.mid); audio.setEq('high', st.high);
            const r = $$('#eq-modal input[type=range]');
            if (r.length >= 3) { r[0].value = st.low; r[1].value = st.mid; r[2].value = st.high; }

            audio.loopVis();
        } catch (e) { console.warn("Audio Init", e); }
    },
    connect: (videoEl) => {
        if (!audio.ctx) return;
        if (audio.ctx.state === 'suspended') audio.ctx.resume();

        if (audio.source) return;
        try {
            audio.source = audio.ctx.createMediaElementSource(videoEl);
            audio.source.connect(audio.bands.low)
                .connect(audio.bands.mid)
                .connect(audio.bands.high)
                .connect(audio.analyser)
                .connect(audio.ctx.destination);
        } catch (e) { console.error("Audio Connect", e); }
    },
    setEq: (band, val) => {
        if (audio.bands[band]) audio.bands[band].gain.value = val;
        store.state.eq[band] = val;
        store.save();
    },
    preset: (type) => {
        const p = {
            rock: [5, -2, 5], pop: [-1, 3, 3], jazz: [3, 2, -2],
            vocal: [-3, 5, 1], bass: [8, 1, -2], flat: [0, 0, 0]
        };
        if (!p[type]) return;
        const [l, m, h] = p[type];
        audio.setEq('low', l); audio.setEq('mid', m); audio.setEq('high', h);
        const inputs = $$('#eq-modal input[type=range]');
        if (inputs.length >= 3) { inputs[0].value = l; inputs[1].value = m; inputs[2].value = h; }
        app.toast("EQ: " + type);
    },
    loopVis: () => {
        const cvs = $("#visualizer");
        if (!cvs) return;
        const ctx = cvs.getContext("2d");
        const buffer = new Uint8Array(audio.analyser.frequencyBinCount);

        const draw = () => {
            requestAnimationFrame(draw);
            if (!player.active || !player.active.type.startsWith("audio") || player.el.paused) {
                if (cvs.width > 0) ctx.clearRect(0, 0, cvs.width, cvs.height);
                return;
            }
            audio.analyser.getByteFrequencyData(buffer);
            cvs.width = cvs.clientWidth;
            cvs.height = cvs.clientHeight;
            ctx.clearRect(0, 0, cvs.width, cvs.height);

            const barW = (cvs.width / buffer.length) * 2.5;
            let x = 0;
            const color = getComputedStyle(document.body).getPropertyValue('--md-sys-color-primary');
            ctx.fillStyle = color;

            for (let i = 0; i < buffer.length; i++) {
                const h = (buffer[i] / 255) * cvs.height * 0.9;
                ctx.fillRect(x, cvs.height - h, barW, h);
                x += barW + 1;
            }
        };
        draw();
    }
};

/* QUEUE SYSTEM */
const queue = {
    list: [],
    add: (item) => {
        if (!item) return;
        if (queue.list.some(i => i.id === item.id)) return;

        queue.list.push(item);
        queue.save();
        queue.render();
        app.toast("Added to Queue");

        if (queue.list.length === 1 && !player.active) {
            player.load(item);
            app.nav('playing');
        }
    },
    remove: (idx, e) => {
        if (e) e.stopPropagation();
        const item = queue.list[idx];

        if (player.active && player.active.id === item.id) {
            player.el.pause();
            player.el.removeAttribute('src');
            player.active = null;
            player.srcBlob = null;
            ui.resetPlayer();
        }

        queue.list.splice(idx, 1);
        queue.save();
        queue.render();
    },
    clear: () => {
        queue.list = [];
        queue.save();
        queue.render();
    },
    save: () => {
        store.state.queue = queue.list.map(i => i.id);
        store.save();
    },
    render: () => {
        const c = $("#queue-cont");
        c.innerHTML = "";
        queue.list.forEach((item, idx) => {
            const div = document.createElement("div");
            div.className = `q-item ${player.active && player.active.id === item.id ? 'active' : ''}`;
            div.draggable = true;
            div.innerHTML = `
                <div class="q-thumb" style="background-image:url(${item.thumb || './src/logo-transparent.png'})"></div>
                <div class="q-info">
                    <div class="q-title">${item.name}</div>
                </div>
                <div onclick="queue.remove(${idx}, event)" style="padding:4px; opacity:0.7">&times;</div>
            `;
            div.onclick = () => {
                player.load(item);
                app.nav('playing');
            };

            div.ondragstart = e => { e.dataTransfer.setData("idx", idx); div.classList.add("dragging"); };
            div.ondragend = () => div.classList.remove("dragging");
            div.ondragover = e => e.preventDefault();
            div.ondrop = e => {
                e.preventDefault();
                const oldIdx = e.dataTransfer.getData("idx");
                const item = queue.list.splice(oldIdx, 1)[0];
                queue.list.splice(idx, 0, item);
                queue.save();
                queue.render();
            };
            c.appendChild(div);
        });
    }
};

/* PLAYER ENGINE */
const player = {
    el: $("#video-el"),
    active: null,
    srcBlob: null,
    shuffle: false, loop: false,

    load: async (item, paused = false) => {
        if (!item || !item.blob) {
            app.toast("Error: File not found in DB");
            return;
        }

        if (player.srcBlob) URL.revokeObjectURL(player.srcBlob);
        player.active = item;

        player.srcBlob = URL.createObjectURL(item.blob);
        player.el.src = player.srcBlob;

        if (audio.ctx && audio.ctx.state === 'suspended') {
            await audio.ctx.resume();
        }
        if (!audio.source) audio.connect(player.el);

        if (!paused) {
            try { await player.el.play(); } catch (e) { console.log("Autoplay blocked", e); }
        }

        const titleEl = $("#curr-title");
        titleEl.innerHTML = `<span>${item.name}</span>`;
        requestAnimationFrame(() => updateScrollingTitle(titleEl));

        $("#curr-thumb").style.backgroundImage = item.thumb ? `url(${item.thumb})` : 'url(./src/logo-transparent.png)';

        const isAudio = item.type.startsWith("audio");
        player.el.style.opacity = isAudio ? 0 : 1;

        if (!item.thumb && !isAudio) ui.genThumb(item);

        $("#empty-msg").style.display = 'none';
        ui.renderCtrls();
        queue.render();
    },

    toggle: () => {
        if (!player.active) return;
        player.el.paused ? player.el.play() : player.el.pause();
    },

    next: () => {
        if (!queue.list.length) return;
        let idx = queue.list.findIndex(i => i.id === player.active?.id);

        if (player.shuffle) {
            idx = Math.floor(Math.random() * queue.list.length);
        } else {
            idx = idx + 1;
            if (idx >= queue.list.length) idx = 0;
        }
        player.load(queue.list[idx]);
    },

    prev: () => {
        if (!queue.list.length) return;
        let idx = queue.list.findIndex(i => i.id === player.active?.id);
        if (idx > 0) idx--; else idx = queue.list.length - 1;
        player.load(queue.list[idx]);
    },

    volume: (v) => {
        player.el.volume = v;
        store.state.volume = v;
        store.save();
    },

    setSpeed: (val) => {
        player.el.playbackRate = parseFloat(val);
        $("#speed-val").innerText = val;
    },

    togglePiP: async () => {
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
            } else if (player.el.readyState >= 1) {
                await player.el.requestPictureInPicture();
            } else {
                app.toast("No media playing");
            }
        } catch (e) { app.toast("PiP Error: " + e.message); }
    },

    filter: (type, val) => {
        store.state.vidFilters[type] = val;
        const f = store.state.vidFilters;
        player.el.style.filter = `brightness(${f.brightness}) contrast(${f.contrast}) saturate(${f.saturate}) hue-rotate(${f.hue}deg)`;
        store.save();
    },

    loadSub: (input) => {
        const file = input.files[0];
        if (!file) return;
        const track = document.createElement("track");
        track.kind = "captions";
        track.label = "English";
        track.srclang = "en";
        track.src = URL.createObjectURL(file);
        track.default = true;
        player.el.innerHTML = "";
        player.el.appendChild(track);
        app.toast("Subtitles Loaded");
    }
};

player.el.onended = () => player.loop ? player.el.play() : player.next();
player.el.ontimeupdate = () => {
    if (!player.el.duration) return;
    const pct = (player.el.currentTime / player.el.duration) * 100;
    $("#seek-fill").style.width = pct + "%";
    $("#curr-time").innerText = formatTime(player.el.currentTime);
    $("#total-time").innerText = formatTime(player.el.duration);
};

window.onkeydown = e => {
    if (e.target.tagName === 'INPUT') return;
    if (e.code === "Space") { e.preventDefault(); player.toggle(); }
    if (e.code === "ArrowRight") player.el.currentTime += 5;
    if (e.code === "ArrowLeft") player.el.currentTime -= 5;
    if (e.code === "ArrowUp") { e.preventDefault(); player.el.volume = Math.min(1, player.el.volume + 0.1); $("#vol-slider").value = player.el.volume; }
    if (e.code === "ArrowDown") { e.preventDefault(); player.el.volume = Math.max(0, player.el.volume - 0.1); $("#vol-slider").value = player.el.volume; }
};

/* UI UTILS */
const ui = {
    setup: () => {
        $("#seek-bar").onclick = e => {
            if (!player.active) return;
            const rect = $("#seek-bar").getBoundingClientRect();
            const pos = (e.clientX - rect.left) / rect.width;
            player.el.currentTime = pos * player.el.duration;
        };

        const f = store.state.vidFilters;
        $$("#vid-modal input[type=range]").forEach((el, i) => {
            if (i === 0) el.value = f.brightness;
            if (i === 1) el.value = f.contrast;
            if (i === 2) el.value = f.saturate;
            if (i === 3) el.value = f.hue || 0;
        });
        player.filter('brightness', f.brightness);

        $("#search").oninput = (e) => {
            const term = e.target.value.toLowerCase();
            const res = app.items.filter(i => i.name.toLowerCase().includes(term));
            ui.renderGrid(res);
        };

        document.onclick = (e) => {
            if (!e.target.closest('#ctx-menu')) $('#ctx-menu').style.display = 'none';
        }
    },
    toggleQueue: () => {
        document.body.classList.toggle('q-toggled');
        const btn = $("#btn-q-toggle");
        if (btn) btn.classList.toggle('active');
    },
    resetPlayer: () => {
        player.active = null;
        if (player.srcBlob) URL.revokeObjectURL(player.srcBlob);
        player.el.removeAttribute('src');
        const t = $("#curr-title");
        t.innerHTML = "<span>No Media</span>";
        t.classList.remove("animate");
        $("#curr-thumb").style.backgroundImage = 'url(./src/logo-transparent.png)';
        $("#curr-time").innerText = "00:00";
        $("#total-time").innerText = "00:00";
        $("#seek-fill").style.width = "0%";
        $("#empty-msg").style.display = 'flex';
        ui.renderCtrls();
    },

    renderGrid: (items) => {
        const grid = $("#lib-grid");
        grid.innerHTML = "";
        items.forEach(item => {
            const el = document.createElement("div");
            el.className = "media-card";
            el.innerHTML = `
                <div class="card-thumb" style="${item.thumb ? 'background-image:url(' + item.thumb + ')' : ''}">
                   ${!item.thumb && item.type.startsWith('audio') ? '<svg width="40" height="40" fill="var(--md-sys-color-on-surface-variant)" viewBox="0 0 24 24"><path d="M12 3v9.28a4.39 4.39 0 00-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>' : ''}
                   <div class="fav-btn ${item.fav ? 'active' : ''}" onclick="app.toggleFav('${item.id}', event)">
                        <svg width="18" height="18" fill="${item.fav ? 'var(--md-sys-color-error)' : '#fff'}" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                   </div>
                </div>
                <div class="card-info">
                    <div class="card-title" title="${item.name}">${item.name}</div>
                    <div class="card-meta"><span>${(item.size / 1048576).toFixed(1)}MB</span><span>${item.type.split('/')[1].toUpperCase()}</span></div>
                </div>
            `;
            el.onclick = () => { queue.add(item); };
            el.oncontextmenu = (e) => {
                e.preventDefault();
                ui.showCtx(e, item);
            };
            grid.appendChild(el);
        });
    },

    genThumb: (item) => {
        const vid = document.createElement("video");
        vid.src = URL.createObjectURL(item.blob);
        vid.muted = true;
        vid.currentTime = 5;
        vid.onloadeddata = () => {
            setTimeout(() => {
                const cvs = document.createElement("canvas");
                cvs.width = 320; cvs.height = 180;
                cvs.getContext('2d').drawImage(vid, 0, 0, cvs.width, cvs.height);
                item.thumb = cvs.toDataURL("image/jpeg", 0.5);
                app.db.update(item);
                if (store.state.activeTab === 'library' || store.state.activeTab === 'video') app.refreshLib();
                if (player.active && player.active.id === item.id) $("#curr-thumb").style.backgroundImage = `url(${item.thumb})`;
            }, 500);
        };
    },

    renderCtrls: () => {
        const pBtn = $("#btn-play");
        pBtn.innerHTML = player.el.paused ?
            '<svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>' :
            '<svg width="28" height="28" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';

        $("#btn-loop").classList.toggle("active", player.loop);
        $("#btn-shuffle").classList.toggle("active", player.shuffle);
    },

    showCtx: (e, item) => {
        const m = $("#ctx-menu");
        m.style.display = "block";
        m.style.left = Math.min(e.clientX, window.innerWidth - 170) + "px";
        m.style.top = e.clientY + "px";
        m.innerHTML = `
            <div class="ctx-item" onclick="player.load(app.items.find(i=>i.id=='${item.id}')); app.nav('playing')">Play Now</div>
            <div class="ctx-item" onclick="queue.add(app.items.find(i=>i.id=='${item.id}'))">Add to Queue</div>
            <hr style="border:0; border-top:1px solid rgba(255,255,255,0.1); margin:4px 0">
            <div class="ctx-item" onclick="app.removeMedia('${item.id}')" style="color:var(--md-sys-color-error)">Delete File</div>
        `;
    }
};

player.el.onplay = ui.renderCtrls;
player.el.onpause = ui.renderCtrls;
app.init();


function updateScrollingTitle(el) {
    if (!el) return;

    const span = el.querySelector("span");
    if (!span) return;

    // reset
    el.classList.remove("animate");
    span.style.animationDuration = "";

    // detect overflow
    const overflow = span.scrollWidth > el.clientWidth;
    if (!overflow) return;

    // seconds based on text length (tweakable)
    const chars = span.innerText.length;
    const animationtime = Math.max(6, chars * 0.35); 

    span.style.animationDuration = `${animationtime}s`;
    el.classList.add("animate");
}
