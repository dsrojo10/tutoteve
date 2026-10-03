class WhisperCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.buffer = new Float32Array(4096);
    this.length = 0;
    this.seen = 0;
    this.maxSamples = options.processorOptions.maxSamples;
    this.port.onmessage = event => {
      if (event.data?.type === 'flush') {
        this.emit();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  emit() {
    if (!this.length) return;
    const samples = this.buffer.slice(0, this.length);
    this.port.postMessage({ type: 'samples', samples }, [samples.buffer]);
    this.length = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let index = 0; index < channels[0].length; index += 1) {
      if (this.seen === this.maxSamples) break;
      let sample = 0;
      for (const channel of channels) sample += channel[index] / channels.length;
      this.buffer[this.length++] = sample;
      this.seen += 1;
      if (this.length === this.buffer.length) this.emit();
      if (this.seen === this.maxSamples) {
        this.emit();
        this.port.postMessage({ type: 'limit' });
      }
    }
    return true;
  }
}

registerProcessor('whisper-capture', WhisperCaptureProcessor);
