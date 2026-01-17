import { events } from './events.js';
import { AudioEngine } from './audio-engine.js';
import { ytProvider } from '../providers/youtube.js';
import { queue } from './queue.js';
import { toast } from '../ui/toasts.js';

class Player {
    constructor() {
        // We now have two local media elements
        this.audioElem = new Audio();
        this.audioElem.crossOrigin = "anonymous";
        this.videoElem = null; // Will grab from DOM on init

        this.mode = 'local_audio'; // local_audio, local_video, youtube
        this.activeElement = this.audioElem;
        
        this.currentTrack = null;
        this.audioEngine = null;
        
        // Setup internal event listeners
        this.setupMediaListeners(this.audioElem);
    }

    // Must be called after DOM is ready to find the <video> tag
    init(videoDomId) {
        this.videoElem = document.getElementById(videoDomId);
        this.setupMediaListeners(this.videoElem);
    }

    setupMediaListeners(element) {
        element.ontimeupdate = () => {
            if (this.activeElement === element) this.emitTime();
        };
        element.onended = () => {
            if (this.activeElement === element) this.handleTrackEnd();
        };
        element.onplay = () => events.emit('playback:playing');
        element.onpause = () => events.emit('playback:paused');
    }

    initAudioEngine(element) {
        // Connect Visualizer to whichever element is active
        try { 
            this.audioEngine = new AudioEngine(element); 
            this.audioEngine.resume();
        } catch(e) { console.warn("Audio Context error", e); }
    }

    async play(track) {
        this.pauseAll(); // Stop everything before switching
        this.currentTrack = track;

        // 1. YouTube
        if (track.type === 'youtube') {
            this.mode = 'youtube';
            this.updateLayer('yt-player-placeholder');
            ytProvider.load(track.id);
        }
        
        // 2. Local Video
        else if (track.type === 'video') {
            this.mode = 'local_video';
            this.activeElement = this.videoElem;
            this.updateLayer('local-video');
            
            this.videoElem.src = URL.createObjectURL(track.file);
            this.initAudioEngine(this.videoElem);
            
            try { await this.videoElem.play(); } 
            catch(e) { console.error(e); toast("Video error"); }
        }
        
        // 3. Local Audio
        else {
            this.mode = 'local_audio';
            this.activeElement = this.audioElem;
            this.updateLayer('album-art');
            
            this.audioElem.src = URL.createObjectURL(track.file);
            this.initAudioEngine(this.audioElem);

            try { await this.audioElem.play(); } 
            catch(e) { console.error(e); toast("Audio error"); }
        }
        
        events.emit('track:change', track);
        this.updateBackground(track);
    }

    pauseAll() {
        this.audioElem.pause();
        if(this.videoElem) this.videoElem.pause();
        ytProvider.pause();
    }

    togglePlay() {
        if (this.mode === 'youtube') {
            ytProvider.toggle();
        } else {
            // Local Audio or Video
            if (this.activeElement.paused) this.activeElement.play();
            else this.activeElement.pause();
        }
    }

    seek(percent) {
        if (this.mode === 'youtube') {
            ytProvider.seekTo((percent / 100) * ytProvider.getDuration());
        } else {
            const time = (percent / 100) * this.activeElement.duration;
            this.activeElement.currentTime = time;
        }
    }

    // UI Helpers
    updateLayer(activeId) {
        document.querySelectorAll('.media-layer').forEach(el => el.classList.remove('active'));
        document.getElementById(activeId).classList.add('active');
    }

    updateBackground(track) {
        const bg = document.getElementById('bg-layer');
        if (track.type === 'youtube') {
            bg.style.backgroundImage = `url(https://img.youtube.com/vi/${track.id}/hqdefault.jpg)`;
        } else {
            bg.style.backgroundImage = `url(assets/placeholder.png)`; 
        }
    }

    handleTrackEnd() {
        const next = queue.getNext(this.currentTrack);
        if (next) player.play(next);
        else events.emit('playback:paused');
    }

    emitTime() {
        events.emit('timeupdate', {
            current: this.activeElement.currentTime,
            total: this.activeElement.duration || 0
        });
    }

    // Fullscreen / PiP
    togglePiP() {
        if (this.mode === 'local_video' && document.pictureInPictureEnabled) {
            if (document.pictureInPictureElement) document.exitPictureInPicture();
            else this.videoElem.requestPictureInPicture();
        } else {
            toast("PiP available for video files only");
        }
    }

    toggleFullscreen() {
        const wrapper = document.querySelector('.media-wrapper');
        if (!document.fullscreenElement) {
            wrapper.requestFullscreen().catch(err => toast("Fullscreen blocked"));
        } else {
            document.exitFullscreen();
        }
    }

    getVisualizerData() {
        return this.audioEngine ? this.audioEngine.getFrequencyData() : new Uint8Array(0);
    }
}

export const player = new Player();