const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const elements = {
  support: document.querySelector('#support'),
  browserLanguage: document.querySelector('#browser-language'),
  userAgent: document.querySelector('#user-agent'),
  language: document.querySelector('#language'),
  status: document.querySelector('#status'),
  transcript: document.querySelector('#transcript'),
  log: document.querySelector('#log'),
  micState: document.querySelector('#mic-state'),
  trackReadyState: document.querySelector('#track-ready-state'),
  trackEnabled: document.querySelector('#track-enabled'),
  trackMuted: document.querySelector('#track-muted')
};

let recognition = null;
let stream = null;
let track = null;
let testStartedAt = 0;

elements.support.textContent = Recognition ? 'Disponible' : 'No disponible';
elements.browserLanguage.textContent = navigator.language || 'No disponible';
elements.userAgent.textContent = navigator.userAgent || 'No disponible';

function elapsed() {
  return `+${((performance.now() - testStartedAt) / 1000).toFixed(2)} s`;
}

function record(event, detail = '') {
  const line = `${elapsed()}  ${event}${detail ? `: ${detail}` : ''}`;
  elements.log.textContent += `${line}\n`;
  elements.log.scrollTop = elements.log.scrollHeight;
}

function setStatus(message) {
  elements.status.textContent = message;
}

function refreshTrackState() {
  if (!track) {
    elements.micState.textContent = 'Sin micrófono activo';
    elements.trackReadyState.textContent = '—';
    elements.trackEnabled.textContent = '—';
    elements.trackMuted.textContent = '—';
    return;
  }
  elements.micState.textContent = 'Micrófono activo';
  elements.trackReadyState.textContent = track.readyState;
  elements.trackEnabled.textContent = String(track.enabled);
  elements.trackMuted.textContent = String(track.muted);
}

function resetReport(name) {
  testStartedAt = performance.now();
  elements.log.textContent = '';
  elements.transcript.textContent = 'Aún no se obtuvo texto.';
  record('prueba', name);
}

function stopRecognition() {
  if (!recognition) return;
  const currentRecognition = recognition;
  recognition = null;
  try {
    currentRecognition.stop();
    record('stop', 'SpeechRecognition detenido por el usuario');
  } catch (error) {
    record('stop error', error.name);
  }
}

function stopMicrophone() {
  if (stream) stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
  stream = null;
  track = null;
  refreshTrackState();
}

function stopAll() {
  stopRecognition();
  stopMicrophone();
  setStatus('Todo detenido.');
  record('detener todo');
}

function createRecognition(afterStart) {
  if (!Recognition) {
    setStatus('SpeechRecognition no está disponible en este navegador.');
    record('supported', 'no');
    return null;
  }

  const instance = new Recognition();
  recognition = instance;
  instance.lang = elements.language.value;
  instance.continuous = false;
  instance.interimResults = false;
  record('supported', 'sí');
  record('configuración', `lang=${instance.lang}, continuous=false, interimResults=false`);

  instance.onstart = () => {
    record('start');
    setStatus('Reconocimiento iniciado. Habla ahora.');
    if (afterStart) afterStart();
  };
  instance.onaudiostart = () => record('audiostart');
  instance.onspeechstart = () => record('speechstart');
  instance.onresult = (event) => {
    const transcript = event.results[event.resultIndex][0].transcript;
    elements.transcript.textContent = transcript;
    record('result');
    record('transcript', transcript);
    setStatus('Se obtuvo texto.');
  };
  instance.onerror = (event) => {
    record('error', event.error);
    setStatus(`Error de reconocimiento: ${event.error}`);
    refreshTrackState();
  };
  instance.onend = () => {
    record('end');
    if (recognition === instance) recognition = null;
    if (elements.transcript.textContent === 'Aún no se obtuvo texto.') {
      setStatus('El reconocimiento terminó sin texto. Revisa el registro.');
    }
    refreshTrackState();
  };
  return instance;
}

function startRecognition(afterStart) {
  const instance = createRecognition(afterStart);
  if (!instance) return;
  try {
    record('inicio solicitado');
    instance.start();
  } catch (error) {
    record('start error', error.name);
    setStatus(`No se pudo iniciar: ${error.name}`);
  }
}

async function startMicrophone() {
  if (!navigator.mediaDevices?.getUserMedia) {
    record('getUserMedia', 'no disponible');
    setStatus('getUserMedia no está disponible en este navegador.');
    return false;
  }
  try {
    record('getUserMedia', 'solicitado');
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    track = stream.getAudioTracks()[0] || null;
    if (!track) {
      record('getUserMedia error', 'no entregó pista de audio');
      setStatus('El micrófono no entregó una pista de audio.');
      return false;
    }
    track.addEventListener('mute', () => { record('track mute'); refreshTrackState(); });
    track.addEventListener('unmute', () => { record('track unmute'); refreshTrackState(); });
    track.addEventListener('ended', () => { record('track ended'); refreshTrackState(); });
    refreshTrackState();
    record('getUserMedia', 'micrófono activo');
    return true;
  } catch (error) {
    record('getUserMedia error', `${error.name}${error.message ? ` (${error.message})` : ''}`);
    setStatus(`No se pudo activar el micrófono: ${error.name}`);
    return false;
  }
}

async function runRecognitionOnly() {
  stopAll();
  resetReport('1. reconocimiento solo');
  setStatus('Iniciando reconocimiento sin micrófono propio…');
  startRecognition();
}

async function runWithMicrophone() {
  stopAll();
  resetReport('2. micrófono y reconocimiento');
  setStatus('Solicitando el micrófono…');
  if (await startMicrophone()) {
    setStatus('Micrófono activo. Iniciando reconocimiento…');
    startRecognition();
  }
}

async function runRecognitionFirst() {
  stopAll();
  resetReport('3. reconocimiento antes del micrófono');
  setStatus('Iniciando reconocimiento; el micrófono se pedirá al recibir start…');
  startRecognition(async () => {
    record('orden inverso', 'start recibido; solicitando micrófono');
    await startMicrophone();
  });
}

document.querySelector('#test-recognition').addEventListener('click', runRecognitionOnly);
document.querySelector('#test-microphone').addEventListener('click', runWithMicrophone);
document.querySelector('#test-reverse').addEventListener('click', runRecognitionFirst);
document.querySelector('#stop-recognition').addEventListener('click', stopRecognition);
document.querySelector('#stop-all').addEventListener('click', stopAll);
