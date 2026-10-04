class ChunkProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.parts = [];
    this.length = 0;
    this.target = Math.round(sampleRate * 5);
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    const input = channels[0];
    const copy = new Float32Array(input);
    this.parts.push(copy);
    this.length += copy.length;
    if (this.length >= this.target) {
      const chunk = new Float32Array(this.length);
      let offset = 0;
      for (const part of this.parts) {
        chunk.set(part, offset);
        offset += part.length;
      }
      this.port.postMessage({ audio: chunk, sampleRate }, [chunk.buffer]);
      this.parts = [];
      this.length = 0;
    }
    return true;
  }
}

registerProcessor('whispercpp-chunks', ChunkProcessor);
