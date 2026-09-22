export function createTvPlayback(video, stream, diagnostics, videoDiagnostics, fallbackButton) {
  video.srcObject = stream;
  video.muted = true;
  videoDiagnostics.record('srcObject:assigned');
  let playPending = false;
  let active = false;
  let stopped = false;
  let primed = false;
  let primePending = false;

  function showFallback(show) {
    if (fallbackButton) fallbackButton.hidden = !show;
  }

  function onPlaying() {
    if (stopped) return;
    active = true;
    showFallback(false);
    diagnostics.status('Llamada activa');
  }
  video.addEventListener('playing', onPlaying);

  function attemptPlay() {
    if (stopped || playPending || !stream.getTracks().some(track => track.kind === 'video')) return;
    playPending = true;
    videoDiagnostics.record('play:requested');
    let request;
    try { request = video.play(); } catch { request = Promise.reject(new Error('play failed')); }
    Promise.resolve(request).then(() => {
      if (!stopped) {
        primed = true;
        showFallback(false);
        video.muted = false;
      }
    }).catch(() => {
      if (!stopped) {
        showFallback(true);
        diagnostics.status('Pulsa OK para ver y escuchar');
        videoDiagnostics.record('play:rejected');
      }
    }).finally(() => { playPending = false; });
  }

  function prime() {
    if (stopped || primed || primePending) return;
    video.muted = true;
    primePending = true;
    videoDiagnostics.record('playback:primed-muted');
    let request;
    try { request = video.play(); } catch { request = Promise.reject(new Error('play failed')); }
    Promise.resolve(request).then(() => {
      if (!stopped) {
        primed = true;
        showFallback(false);
      }
    }).catch(() => {
      // An empty stream may not start on older TVs; try again when video arrives.
      videoDiagnostics.record('playback:prime-rejected');
    }).finally(() => { primePending = false; });
  }

  function addTrack(track) {
    if (stopped || stream.getTracks().includes(track)) return;
    stream.addTrack(track);
    videoDiagnostics.record('track:added:' + track.kind);
    diagnostics.remoteTrack('guestTv');
    if (track.kind === 'video') attemptPlay();
  }

  return {
    addTrack, prime, play: attemptPlay,
    isActive: () => active,
    stop() { stopped = true; showFallback(false); video.removeEventListener('playing', onPlaying); },
  };
}
