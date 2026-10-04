const MODEL_URL = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny-q5_1.bin';
const get = (id) => document.getElementById(id);
const state = {
  worker: null, ready: false, capturing: false, busy: false,
  queue: [], chunks: 0, started: 0, timer: null,
  stream: null, context: null, source: null, worklet: null,
};

function showBacklog() { get('backlog').textContent = String(state.queue.length); }
function showError(error) { get('errors').textContent = String(error?.message || error); }

function checkSimd() {
  const bytes = new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,10,23,1,21,0,253,12,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,26,11]);
  return WebAssembly.validate(bytes);
}

function pump() {
  if (!state.ready || state.busy || !state.queue.length) return;
  const next = state.queue.shift();
  state.busy = true;
  showBacklog();
  state.worker.postMessage({ type: 'transcribe', ...next }, [next.audio]);
}

function stop() {
  if (!state.capturing) return;
  state.capturing = false;
  clearInterval(state.timer);
  state.worklet?.disconnect();
  state.source?.disconnect();
  state.stream?.getTracks().forEach((track) => track.stop());
  state.context?.close();
  get('mic').textContent = 'Detenido';
  get('start').disabled = !state.ready;
  get('stop').disabled = true;
}

async function load() {
  get('load').disabled = true;
  get('errors').textContent = 'Ninguno';
  get('load-status').textContent = 'Descargando modelo…';
  const started = performance.now();
  try {
    if (!checkSimd()) throw new Error('Este navegador no admite WASM SIMD');
    const response = await fetch(MODEL_URL);
    if (!response.ok || !response.body) throw new Error(`Descarga fallida (${response.status})`);
    const total = Number(response.headers.get('content-length')) || 0;
    const reader = response.body.getReader();
    const parts = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      size += value.byteLength;
      get('download').textContent = `${(size / 1048576).toFixed(1)} MB${total ? ` / ${(total / 1048576).toFixed(1)} MB` : ''}`;
    }
    const model = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { model.set(part, offset); offset += part.length; }
    get('load-status').textContent = 'Inicializando WASM…';
    state.worker = new Worker(new URL('./whispercpp-worker.js', import.meta.url));
    state.worker.onmessage = ({ data }) => {
      if (data.type === 'ready') {
        state.ready = true;
        get('load-status').textContent = 'Listo';
        get('load-time').textContent = `${((performance.now() - started) / 1000).toFixed(1)} s`;
        get('wasm-memory').textContent = `${(data.wasmBytes / 1048576).toFixed(0)} MiB`;
        get('start').disabled = false;
      } else if (data.type === 'result') {
        state.busy = false;
        get('inference').textContent = `${(data.elapsed / 1000).toFixed(2)} s`;
        get('wasm-memory').textContent = `${(data.wasmBytes / 1048576).toFixed(0)} MiB`;
        if (data.text.trim()) get('transcript').textContent += `${data.text.trim()}\n`;
        pump();
      } else if (data.type === 'error') {
        state.busy = false;
        get('load-status').textContent = state.ready ? 'Listo (con error)' : 'Error';
        showError(data.message);
        pump();
      }
    };
    state.worker.onerror = (event) => { get('load-status').textContent = 'Error'; showError(event.message); };
    state.worker.postMessage({ type: 'init', model: model.buffer }, [model.buffer]);
  } catch (error) {
    get('load-status').textContent = 'Error';
    get('load').disabled = false;
    showError(error);
  }
}

async function start() {
  if (!state.ready || state.capturing) return;
  get('errors').textContent = 'Ninguno';
  get('start').disabled = true;
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: { ideal: 16000 } }, video: false });
    try { state.context = new AudioContext({ sampleRate: 16000 }); }
    catch { state.context = new AudioContext(); }
    await state.context.audioWorklet.addModule(new URL('whispercpp/chunk-worklet.js', document.baseURI));
    state.source = state.context.createMediaStreamSource(state.stream);
    state.worklet = new AudioWorkletNode(state.context, 'whispercpp-chunks');
    state.worklet.port.onmessage = ({ data }) => {
      state.chunks++;
      get('chunks').textContent = String(state.chunks);
      state.queue.push({ audio: data.audio.buffer, sampleRate: data.sampleRate });
      showBacklog();
      pump();
    };
    state.source.connect(state.worklet);
    const silence = state.context.createGain();
    silence.gain.value = 0;
    state.worklet.connect(silence).connect(state.context.destination);
    await state.context.resume();
    state.capturing = true;
    state.started = performance.now();
    get('sample-rate').textContent = `${state.context.sampleRate} Hz`;
    get('mic').textContent = 'Capturando (máximo 60 s)';
    get('stop').disabled = false;
    state.timer = setInterval(() => {
      const elapsed = (performance.now() - state.started) / 1000;
      get('uptime').textContent = `${Math.min(60, elapsed).toFixed(0)} s`;
      if (elapsed >= 60) stop();
    }, 250);
  } catch (error) {
    showError(error);
    stop();
    state.stream?.getTracks().forEach((track) => track.stop());
    state.context?.close();
    get('start').disabled = false;
  }
}

get('simd').textContent = checkSimd() ? 'Sí' : 'No';
get('load').addEventListener('click', load);
get('start').addEventListener('click', start);
get('stop').addEventListener('click', stop);
