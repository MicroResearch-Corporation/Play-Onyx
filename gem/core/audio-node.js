export class AudioEngine {
    constructor(mediaElement) {
        this.context = new (window.AudioContext || window.webkitAudioContext)();
        this.src = this.context.createMediaElementSource(mediaElement);
        this.analyser = this.context.createAnalyser();
        this.analyser.fftSize = 256;
        
        // Connect: Source -> Analyser -> Destination
        this.src.connect(this.analyser);
        this.analyser.connect(this.context.destination);
    }

    getFrequencyData() {
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);
        return dataArray;
    }

    resume() {
        if (this.context.state === 'suspended') {
            this.context.resume();
        }
    }
}