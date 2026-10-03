import { pipeline } from '@huggingface/transformers';
import { createWhisperChunker, resampleTo16k } from './whisper-chunks.js';

const MODEL = 'onnx-community/whisper-tiny';
const DURATION_SECONDS = 60;
const modelOptions = {
  webgpu: { device: 'webgpu', dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' } },
  wasm: { device: 'wasm', dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' } },
};
const element = id => document.getElementById(id);
const startButton = element('start');
const stopButton = element('stop');
const queue = [];
let transcriber;
let backend;
let webgpuAvailable = false;
let stream;
let context;
let source;
let worklet;
let silentOutput;
let chunker;
let captureStartedAt;
let captureSampleRate;
let flushResolve;
let processing = false;
let processingBytes = 0;
let capturing = false;
let loading = false;
let stopping = false;
let cancelled = false;
let transcriptCount = 0;

const seconds = value => `${value.toFixed(1).replace('.', ',')} s`;
const megabytes = value => `${(value / 1_000_000).toFixed(1).replace('.', ',')} MB`;
function status(value) { element('status').textContent = value; }
function errorText(error) { return `${error?.name || 'Error'}: ${error?.message || 'No se pudo completar la operación.'}`; }
function addError(error) {
  const text = element('errors');
  text.textContent = (text.textContent === 'Sin errores.' ? '' : text.textContent + '\n') + errorText(error);
}
function renderQueue() {
  const queuedSeconds = queue.reduce((sum, item) => sum + item.durationSeconds, 0);
  const queuedBytes = queue.reduce((sum, item) => sum + item.audio.byteLength, 0);
  element('backlog').textContent = `${queue.length} chunks · ${seconds(queuedSeconds)} de audio pendiente${processing ? ' · 1 en inferencia' : ''}`;
  element('memory').textContent = `Audio en cola y proceso: ${megabytes(queuedBytes + processingBytes)}. Memoria total no disponible mediante API estándar.`;
}
function renderCapture() {
  element('elapsed').textContent = `${seconds(Math.min(chunker?.seconds || 0, DURATION_SECONDS))} / 60 s`;
  element('chunks').textContent = String(chunker?.count || 0);
}
async function detectWebGPU() {
  try { webgpuAvailable = !!(await navigator.gpu?.requestAdapter()); }
  catch { webgpuAvailable = false; }
  element('webgpu').textContent = webgpuAvailable ? 'Sí' : 'No';
}
const gpuCheck = detectWebGPU();

async function loadModel(device) {
  const started = performance.now();
  element('model-status').textContent = `Cargando por ${device}…`;
  element('model-size').textContent = device === 'webgpu'
    ? 'Aprox. 120 MB de pesos (FP32 + Q4), más archivos auxiliares'
    : 'Aprox. 41 MB de pesos (Q8), más archivos auxiliares';
  const loaded = await pipeline('automatic-speech-recognition', MODEL, {
    ...modelOptions[device],
    progress_callback(event) {
      if (event.status === 'progress_total' && event.total > 0) {
        element('model-status').textContent = `Cargando por ${device}: ${megabytes(event.loaded)} / ${megabytes(event.total)}`;
        element('model-size').textContent = `${megabytes(event.total)} de archivos reportados por la descarga o caché`;
      }
    },
  });
  transcriber = loaded;
  backend = device;
  element('backend').textContent = device;
  element('model-status').textContent = 'Listo';
  element('load-time').textContent = seconds((performance.now() - started) / 1000);
}
async function ensureModel() {
  if (transcriber) return;
  const started = performance.now();
  await gpuCheck;
  if (webgpuAvailable) {
    try { await loadModel('webgpu'); element('load-time').textContent = seconds((performance.now() - started) / 1000); return; }
    catch (error) { addError(new Error(`WebGPU falló: ${errorText(error)}. Se intenta WASM.`)); }
  }
  await loadModel('wasm');
  element('load-time').textContent = seconds((performance.now() - started) / 1000);
}

async function infer(audio) {
  const input = resampleTo16k(audio, captureSampleRate);
  const options = { language: 'spanish', task: 'transcribe', return_timestamps: false, max_new_tokens: 64 };
  try { return await transcriber(input, options); }
  catch (error) {
    if (backend !== 'webgpu') throw error;
    addError(new Error(`Inferencia WebGPU falló: ${errorText(error)}. Se intenta WASM.`));
    try { await transcriber.dispose?.(); } catch {}
    transcriber = undefined;
    await loadModel('wasm');
    return transcriber(input, options);
  }
}

async function drain() {
  if (processing) return;
  processing = true;
  renderQueue();
  while (queue.length) {
    const chunk = queue.shift();
    processingBytes = chunk.audio.byteLength;
    renderQueue();
    const item = document.createElement('li');
    element('chunk-list').append(item);
    element('inference').textContent = `Chunk ${chunk.number}…`;
    const started = performance.now();
    try {
      const result = await infer(chunk.audio);
      const finished = performance.now();
      const inferenceSeconds = (finished - started) / 1000;
      const latencySeconds = (finished - captureStartedAt - (chunk.speechEndedAtMs ?? chunk.endedAtMs)) / 1000;
      const text = result?.text?.trim() || '(sin texto)';
      const latencyLabel = chunk.speechEndedAtMs === null ? 'fin de chunk → texto' : 'fin de voz → texto';
      item.textContent = `Chunk ${chunk.number}: inferencia ${seconds(inferenceSeconds)}; ${latencyLabel} ${seconds(Math.max(0, latencySeconds))}; ${text}`;
      element('inference').textContent = seconds(inferenceSeconds);
      element('latency').textContent = seconds(Math.max(0, latencySeconds));
      if (result?.text?.trim()) {
        if (transcriptCount === 0) element('transcript').textContent = '';
        element('transcript').textContent += `${result.text.trim()} `;
        transcriptCount += 1;
      }
    } catch (error) {
      item.textContent = `Chunk ${chunk.number}: error de inferencia.`;
      addError(error);
      queue.length = 0;
      if (capturing) void stopCapture('Inferencia interrumpida.');
      break;
    } finally { processingBytes = 0; renderQueue(); }
  }
  processing = false;
  renderQueue();
  if (!capturing && !loading && !stopping) finish();
}

function enqueue(chunk) {
  queue.push(chunk);
  renderCapture();
  renderQueue();
  void drain();
}

function releaseMedia() {
  stream?.getTracks().forEach(track => track.stop());
  stream = undefined;
  source?.disconnect();
  worklet?.disconnect();
  silentOutput?.disconnect();
  source = undefined;
  worklet = undefined;
  silentOutput = undefined;
  if (context) void context.close().catch(addError);
  context = undefined;
}

function finish() {
  startButton.disabled = false;
  stopButton.disabled = true;
  status('Prueba terminada. Revisa texto, tiempos, errores y temperatura del iPhone.');
}

async function stopCapture(message = 'Captura terminada; procesando cola…') {
  if (stopping) return;
  if (loading) {
    cancelled = true;
    releaseMedia();
    stopButton.disabled = true;
    status('Carga cancelada; esperando que termine la descarga actual.');
    return;
  }
  if (!capturing) return;
  stopping = true;
  capturing = false;
  status(message);
  if (worklet) {
    await Promise.race([
      new Promise(resolve => { flushResolve = resolve; worklet.port.postMessage({ type: 'flush' }); }),
      new Promise(resolve => setTimeout(resolve, 500)),
    ]);
  }
  chunker.flush();
  renderCapture();
  releaseMedia();
  stopButton.disabled = true;
  stopping = false;
  if (!processing && !queue.length) finish();
}

async function start() {
  startButton.disabled = true;
  stopButton.disabled = false;
  cancelled = false;
  loading = true;
  queue.length = 0;
  transcriptCount = 0;
  chunker = undefined;
  element('transcript').textContent = 'Aún no hay texto.';
  element('chunk-list').replaceChildren();
  element('errors').textContent = 'Sin errores.';
  element('inference').textContent = '—';
  element('latency').textContent = '—';
  renderCapture();
  renderQueue();
  try {
    status('Solicitando micrófono. La captura comenzará después de cargar el modelo.');
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    if (cancelled) { releaseMedia(); return; }
    stream.getAudioTracks()[0].addEventListener('ended', () => {
      addError(new Error('El micrófono dejó de enviar audio.'));
      void stopCapture('Micrófono detenido.');
    });
    status('Cargando modelo en el dispositivo…');
    await ensureModel();
    if (cancelled) { releaseMedia(); return; }
    context = new AudioContext();
    captureSampleRate = context.sampleRate;
    await context.audioWorklet.addModule(`${import.meta.env.BASE_URL}whisper-capture-worklet.js`);
    source = context.createMediaStreamSource(stream);
    worklet = new AudioWorkletNode(context, 'whisper-capture', {
      processorOptions: { maxSamples: Math.round(context.sampleRate * DURATION_SECONDS) },
    });
    worklet.addEventListener('processorerror', () => {
      addError(new Error('Falló el procesador local de audio.'));
      void stopCapture('Captura interrumpida.');
    });
    silentOutput = context.createGain();
    silentOutput.gain.value = 0;
    worklet.port.onmessage = event => {
      if (event.data?.type === 'flushed') { flushResolve?.(); flushResolve = undefined; return; }
      if (event.data?.type === 'limit') { if (capturing) void stopCapture(); return; }
      if (event.data?.type !== 'samples') return;
      chunker.push(event.data.samples);
      renderCapture();
      if (chunker.seconds >= DURATION_SECONDS && capturing) void stopCapture();
    };
    chunker = createWhisperChunker(context.sampleRate, enqueue);
    source.connect(worklet);
    worklet.connect(silentOutput);
    silentOutput.connect(context.destination);
    await context.resume();
    captureStartedAt = performance.now();
    loading = false;
    capturing = true;
    status('Grabando y transcribiendo localmente durante 60 segundos…');
  } catch (error) {
    addError(error);
    status('No se pudo iniciar la prueba.');
    releaseMedia();
    startButton.disabled = false;
    stopButton.disabled = true;
  } finally { loading = false; if (cancelled) { startButton.disabled = false; stopButton.disabled = true; } }
}

startButton.addEventListener('click', start);
stopButton.addEventListener('click', () => { void stopCapture(); });
window.addEventListener('pagehide', () => { void stopCapture(); });
