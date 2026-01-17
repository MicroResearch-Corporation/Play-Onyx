export class AudioEngine {
    constructor(mediaElem) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.src = this.ctx.createMediaElementSource(mediaElem);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 64; // Fewer bars for cleaner look
        this.src.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);
    }
    resume() { if(this.ctx.state === 'suspended') this.ctx.resume(); }
    getFrequencyData() {
        const arr = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteFrequencyData(arr);
        return arr;
    }
}