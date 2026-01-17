import { events } from '../core/events.js';

export class YouTubeProvider {
    constructor() {
        this.player = null;
        this.ready = false;
        this.containerId = 'yt-player-placeholder';
    }

    load(videoId) {
        // Show container, hide art
        document.getElementById('yt-player-placeholder').style.display = 'block';
        document.getElementById('album-art').style.display = 'none';

        if (this.player) {
            this.player.loadVideoById(videoId);
        } else {
            this.player = new YT.Player(this.containerId, {
                height: '100%',
                width: '100%',
                videoId: videoId,
                playerVars: { 'autoplay': 1, 'controls': 0 },
                events: {
                    'onReady': () => { this.ready = true; },
                    'onStateChange': (event) => this.onStateChange(event)
                }
            });
        }
    }

    play() { if(this.player) this.player.playVideo(); }
    pause() { if(this.player) this.player.pauseVideo(); }
    seekTo(seconds) { if(this.player) this.player.seekTo(seconds, true); }
    getDuration() { return this.player ? this.player.getDuration() : 0; }
    getCurrentTime() { return this.player ? this.player.getCurrentTime() : 0; }

    onStateChange(event) {
        if (event.data === YT.PlayerState.PLAYING) events.emit('playback:playing');
        if (event.data === YT.PlayerState.PAUSED) events.emit('playback:paused');
        if (event.data === YT.PlayerState.ENDED) events.emit('playback:ended');
    }
}

export const ytProvider = new YouTubeProvider();