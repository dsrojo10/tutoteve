export function createTvPlayback(video, stream, diagnostics, videoDiagnostics) {
  video.srcObject = stream;
  videoDiagnostics.record('srcObject:assigned');
  let playPending = false;
  let active = false;
  let stopped = false;

  function onPlaying() {
    if (stopped) return;
    active = true;
    diagnostics.status('Llamada activa');
  }
  video.addEventListener('playing', onPlaying);

  function play() {
    if (stopped || playPending || !video.paused || !stream.getTracks().some(track => track.kind === 'video')) return;
    playPending = true;
    videoDiagnostics.record('play:requested');
    Promise.resolve().then(() => video.play()).catch(() => {
      videoDiagnostics.record('play:rejected');
      diagnostics.status('Vídeo recibido. Pulsa “Activar reproducción”.');
    }).finally(() => { playPending = false; });
  }

  function addTrack(track) {
    if (stopped || stream.getTracks().includes(track)) return;
    stream.addTrack(track);
    videoDiagnostics.record('track:added:' + track.kind);
    diagnostics.remoteTrack('guestTv');
    if (track.kind === 'video') play();
  }

  return {
    addTrack,
    play,
    isActive: () => active,
    stop() { stopped = true; video.removeEventListener('playing', onPlaying); },
  };
}
