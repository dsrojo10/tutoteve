/* global createWhisperModule */
importScripts(new URL('../whispercpp/whispercpp.js', self.location.href).href);

let module;
let modelPointer = 0;

function resample(input, rate) {
  if (rate === 16000) return input;
  const length = Math.round(input.length * 16000 / rate);
  const output = new Float32Array(length);
  const ratio = rate / 16000;
  for (let i = 0; i < length; i++) {
    const position = i * ratio;
    const first = Math.floor(position);
    const fraction = position - first;
    output[i] = input[first] * (1 - fraction) + (input[Math.min(first + 1, input.length - 1)] || 0) * fraction;
  }
  return output;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      module = await createWhisperModule({ locateFile: (name) => new URL(`../whispercpp/${name}`, self.location.href).href });
      modelPointer = module._malloc(data.model.byteLength);
      if (!modelPointer) throw new Error('No hay memoria para el modelo');
      module.HEAPU8.set(new Uint8Array(data.model), modelPointer);
      const result = module._whisper_test_init(modelPointer, data.model.byteLength);
      if (result) throw new Error(`El modelo no pudo inicializarse (${result})`);
      self.postMessage({ type: 'ready', wasmBytes: module.HEAPU8.byteLength });
    } else if (data.type === 'transcribe') {
      const start = performance.now();
      const audio = resample(new Float32Array(data.audio), data.sampleRate);
      const pointer = module._malloc(audio.byteLength);
      if (!pointer) throw new Error('No hay memoria para el chunk');
      try {
        module.HEAPF32.set(audio, pointer / 4);
        const result = module._whisper_test_transcribe(pointer, audio.length);
        if (result) throw new Error(`Falló la inferencia (${result})`);
        self.postMessage({ type: 'result', text: module.UTF8ToString(module._whisper_test_text()), elapsed: performance.now() - start, wasmBytes: module.HEAPU8.byteLength });
      } finally {
        module._free(pointer);
      }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error?.message || error) });
  }
};
