export function setMicrophoneMuted(stream, muted) {
  stream.getAudioTracks().forEach(track => { track.enabled = !muted; });
}

export function addMicrophoneButton(video, stream) {
  const button = document.createElement('button');
  button.type = 'button';
  let muted = false;
  function render() {
    button.textContent = muted ? 'Activar micrófono' : 'Silenciar micrófono';
    button.setAttribute('aria-pressed', String(muted));
  }
  button.addEventListener('click', () => {
    muted = !muted;
    setMicrophoneMuted(stream, muted);
    render();
  });
  stream.getAudioTracks().forEach(track => track.addEventListener('ended', () => { button.disabled = true; }));
  render();
  video.insertAdjacentElement('afterend', button);
}
