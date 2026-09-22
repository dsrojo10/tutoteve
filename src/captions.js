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
  let recognitionAttempt = 0;
  let abortedStreak = 0;
  let restartTimer;
  let lastPublished = '';
  let lastEvent = '';
  let error = '';
  function state() { report({ supported, running, restartCount, recognitionAttempt, lastEvent, error, textLength: context.text().length }); }
  function send() {
    const value = context.text();
    if (value && value !== lastPublished) {
      lastPublished = value;
      Promise.resolve().then(() => publish(value)).catch(() => {});
    }
  }
  function restart(delay) {
    if (!active || restartTimer !== undefined) return;
    restartTimer = timers.setTimeout(() => { restartTimer = undefined; if (active) begin(); }, delay);
    restartCount += 1;
    state();
  }
  function restartDelay(reason) {
    if (reason === 'aborted') {
      const delay = Math.min(1600 * 2 ** Math.min(abortedStreak, 2), 8000);
      abortedStreak += 1;
      return delay;
    }
    return reason ? 1500 : 850;
  }
  function configure(instance) {
    instance.lang = 'es-CO';
    instance.continuous = false;
    instance.interimResults = false;
    instance.onstart = () => {
      if (recognition !== instance) return;
      running = true;
      lastEvent = 'start';
      error = '';
      if (!active) { try { instance.abort(); } catch {} }
      state();
    };
    instance.onresult = event => {
      if (!active || recognition !== instance) return;
      lastEvent = 'result';
      let transcript = '';
      for (let index = event.resultIndex || 0; index < event.results.length; index += 1) transcript += (event.results[index][0]?.transcript || '') + ' ';
      if (transcript.trim()) {
        context.addFinal(transcript);
        abortedStreak = 0;
        send();
      }
      state();
    };
    instance.onerror = event => {
      if (recognition !== instance) return;
      lastEvent = 'error';
      error = event.error || 'Error';
      if (error === 'not-allowed' || error === 'service-not-allowed') active = false;
      state();
    };
    instance.onend = () => {
      if (recognition !== instance) return;
      running = false;
      const reason = error;
      recognition = undefined;
      lastEvent = 'end';
      if (active) restart(restartDelay(reason));
      state();
    };
  }
  function begin() {
    if (!active || running) return;
    let instance;
    try {
      instance = new SpeechRecognition();
      recognitionAttempt += 1;
      configure(instance);
      recognition = instance;
      instance.start();
    }
    catch (cause) {
      error = cause?.name || 'Error';
      lastEvent = 'error';
      recognition = undefined;
      if (!instance) {
        supported = false;
        active = false;
      } else if (error === 'NotAllowedError' || error === 'SecurityError' || error === 'not-allowed' || error === 'service-not-allowed') active = false;
      else restart(restartDelay(error));
      state();
    }
  }
  state();
  return {
    get supported() { return supported; },
    start() { if (!supported || active) return; active = true; begin(); },
    stop() {
      active = false;
      if (restartTimer !== undefined) timers.clearTimeout(restartTimer);
      restartTimer = undefined;
      if (recognition) { try { recognition.abort ? recognition.abort() : recognition.stop(); } catch {} }
      recognition = undefined;
      running = false; context.clear(); lastPublished = ''; state();
    },
  };
}
