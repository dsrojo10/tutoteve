const events = ['play', 'playing', 'pause', 'waiting', 'stalled', 'suspend',
  'canplay', 'loadedmetadata', 'resize', 'emptied', 'error'];
const finite = value => Number.isFinite(value) ? value : null;

export function videoSnapshot(video) {
  const tracks = video.srcObject && typeof video.srcObject.getTracks === 'function'
    ? video.srcObject.getTracks() : [];
  return {
    paused: video.paused, ended: video.ended,
    readyState: video.readyState, networkState: video.networkState,
    currentTime: finite(video.currentTime), duration: finite(video.duration),
    videoWidth: video.videoWidth, videoHeight: video.videoHeight,
    playbackRate: video.playbackRate, muted: video.muted, volume: video.volume,
    srcObjectPresent: !!video.srcObject, trackCount: tracks.length,
    tracks: tracks.map(track => ({
      kind: track.kind, readyState: track.readyState, muted: track.muted, enabled: track.enabled,
    })),
    errorCode: video.error ? video.error.code : null,
  };
}

// No independent timer: sample() is called alongside each RTCPeerConnection stats sample.
export function observeVideo(video, enabled, publish, now = () => performance.now()) {
  if (!enabled) return { sample: () => null, record: () => {}, dispose: () => {} };
  const started = now();
  const history = [];
  let disposed = false;
  const seconds = () => Math.round((now() - started) / 10) / 100;
  function sample() {
    return { seconds: seconds(), ...videoSnapshot(video), events: history.slice() };
  }
  function record(event) {
    if (disposed) return;
    history.push({ seconds: seconds(), event, currentTime: finite(video.currentTime) });
    if (history.length > 16) history.shift();
    publish(sample());
  }
  const listeners = events.map(event => {
    const listener = () => record(event);
    video.addEventListener(event, listener);
    return [event, listener];
  });
  publish(sample());
  return {
    sample, record,
    dispose() {
      disposed = true;
      listeners.forEach(([event, listener]) => video.removeEventListener(event, listener));
    },
  };
}
