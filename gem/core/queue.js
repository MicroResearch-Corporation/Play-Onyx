import { events } from './events.js';

class Queue {
    constructor() {
        this.tracks = [];
        this.originalIndex = -1; // To track position
    }

    add(track) {
        this.tracks.push(track);
        events.emit('queue:updated', this.tracks);
    }

    setQueue(tracks) {
        this.tracks = tracks;
        events.emit('queue:updated', this.tracks);
    }

    clear() {
        this.tracks = [];
        this.originalIndex = -1;
        events.emit('queue:updated', this.tracks);
    }

    getNext(currentTrack) {
        if (this.tracks.length === 0) return null;
        const idx = this.tracks.findIndex(t => t.id === currentTrack?.id);
        if (idx === -1 || idx === this.tracks.length - 1) return null; // End of queue
        return this.tracks[idx + 1];
    }

    getPrevious(currentTrack) {
        if (this.tracks.length === 0) return null;
        const idx = this.tracks.findIndex(t => t.id === currentTrack?.id);
        if (idx <= 0) return null;
        return this.tracks[idx - 1];
    }
}

export const queue = new Queue();