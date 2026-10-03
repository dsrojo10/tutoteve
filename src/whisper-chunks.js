export function createWhisperChunker(sampleRate, onChunk, seconds = 2.5) {
  const target = Math.round(sampleRate * seconds);
  let parts = [];
  let buffered = 0;
  let total = 0;
  let lastVoice = null;
  let count = 0;

  function emit() {
    if (!buffered) return;
    const audio = new Float32Array(buffered);
    let position = 0;
    for (const part of parts) { audio.set(part, position); position += part.length; }
    count += 1;
    onChunk({ number: count, audio, durationSeconds: buffered / sampleRate,
      endedAtMs: total / sampleRate * 1000,
      speechEndedAtMs: lastVoice === null ? null : lastVoice / sampleRate * 1000 });
    parts = [];
    buffered = 0;
    lastVoice = null;
  }

  return {
    push(samples) {
      let offset = 0;
      while (offset < samples.length) {
        const take = Math.min(target - buffered, samples.length - offset);
        const part = samples.subarray(offset, offset + take);
        let energy = 0;
        for (const value of part) energy += value * value;
        if (Math.sqrt(energy / take) > 0.012) lastVoice = total + take;
        parts.push(part);
        buffered += take;
        total += take;
        offset += take;
        if (buffered === target) emit();
      }
    },
    flush() { if (buffered >= sampleRate / 3) emit(); },
    get seconds() { return total / sampleRate; },
    get count() { return count; },
  };
}

export function resampleTo16k(input, sourceRate) {
  if (sourceRate === 16000) return input;
  const length = Math.round(input.length * 16000 / sourceRate);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index * sourceRate / 16000;
    const first = Math.floor(position);
    const fraction = position - first;
    output[index] = input[first] * (1 - fraction) + input[Math.min(first + 1, input.length - 1)] * fraction;
  }
  return output;
}
