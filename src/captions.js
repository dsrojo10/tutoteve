export function createCaptionContext(maxLength = 240, maxFinals = 3) {
  let finals = [];
  let interim = '';
  function fit(text) { return text.length <= maxLength ? text : text.slice(-maxLength).replace(/^\S*\s/, ''); }
  function text() { return fit([...finals, interim].filter(Boolean).join(' ')); }
  return {
    addFinal(value) {
      const phrase = String(value || '').trim();
      if (phrase) finals.push(phrase);
      finals = finals.slice(-maxFinals);
      interim = '';
      return text();
    },
    setInterim(value) { interim = String(value || '').trim(); return text(); },
    text,
    clear() { finals = []; interim = ''; },
  };
}

export function createSpeechCaptions(SpeechRecognition, publish, report, timers = { setTimeout, clearTimeout }) {
  let supported = typeof SpeechRecognition === 'function';
  const context = createCaptionContext();
  let recognition;
  let active = false;
  let running = false;
  let restartCount = 0;
  let restartTimer;
  let publishTimer;
  let lastPublished = '';
  let finalIndexes = new Set();
  let lastEvent = '';
  let error = '';
  function state() { report({ supported, running, restartCount, lastEvent, error, textLength: context.text().length }); }
  function send() {
    publishTimer = undefined;
    const value = context.text();
    if (value && value !== lastPublished) {
      lastPublished = value;
      Promise.resolve().then(() => publish(value)).catch(() => {});
    }
  }
  function scheduleSend(immediate) {
    if (publishTimer !== undefined) timers.clearTimeout(publishTimer);
    publishTimer = timers.setTimeout(send, immediate ? 0 : 300);
  }
  function restart() {
    if (!active || restartTimer !== undefined) return;
    const delay = Math.min(1000 * 2 ** Math.min(restartCount, 3), 8000);
    restartTimer = timers.setTimeout(() => { restartTimer = undefined; if (active) begin(); }, delay);
    restartCount += 1;
    state();
  }
  function begin() {
    if (!active || running) return;
    try { recognition.start(); }
    catch (cause) {
      error = cause?.name || 'Error';
      lastEvent = 'error';
      if (error === 'NotAllowedError' || error === 'SecurityError') active = false;
      else restart();
      state();
    }
  }
  if (supported) {
    try { recognition = new SpeechRecognition(); }
    catch { supported = false; }
  }
  if (recognition) {
    recognition.lang = 'es-CO';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => { running = true; lastEvent = 'start'; error = ''; finalIndexes = new Set(); if (!active) { try { recognition.stop(); } catch {} } state(); };
    recognition.onresult = event => {
      if (!active) return;
      lastEvent = 'result';
      let interim = '';
      let hasFinal = false;
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          if (!finalIndexes.has(index)) { context.addFinal(transcript); finalIndexes.add(index); hasFinal = true; }
        } else { interim += transcript + ' '; }
      }
      context.setInterim(interim);
      restartCount = 0;
      scheduleSend(hasFinal);
      state();
    };
    recognition.onerror = event => {
      lastEvent = 'error'; error = event.error || 'Error';
      if (error === 'not-allowed' || error === 'service-not-allowed') active = false;
      state();
    };
    recognition.onend = () => {
      running = false; lastEvent = 'end'; finalIndexes = new Set(); context.setInterim('');
      if (context.text()) scheduleSend(true);
      if (active) restart();
      state();
    };
  }
  state();
  return {
    supported,
    start() { if (!supported || active) return; active = true; begin(); },
    stop() {
      active = false;
      if (restartTimer !== undefined) timers.clearTimeout(restartTimer);
      if (publishTimer !== undefined) timers.clearTimeout(publishTimer);
      restartTimer = publishTimer = undefined;
      if (recognition && running) { try { recognition.stop(); } catch {} }
      running = false; context.clear(); lastPublished = ''; state();
    },
  };
}
