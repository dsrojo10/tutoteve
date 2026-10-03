export function signalingErrorCategory(error) {
  return error?.code === 'PERMISSION_DENIED' || error?.code === 'permission-denied' || error?.name === 'PermissionDeniedError'
    ? 'permission-denied' : 'signaling-error';
}

export function createGuestCallLifecycle(captions, report) {
  const state = { callEnded: false, callEndedReason: '', sessionRemovedSeen: false, endedBySeen: false, captionsStartRequested: false, errorCategory: '' };
  let captionState = {};
  function update() { report({ ...captionState, ...state }); }
  function end(reason) {
    if (state.callEnded) return;
    state.callEnded = true;
    state.callEndedReason = reason;
    captions.stop();
    update();
  }
  update();
  return {
    captions(value) { captionState = value; update(); },
    startCaptions() {
      if (state.callEnded || state.captionsStartRequested) return;
      state.captionsStartRequested = true;
      update();
      captions.start();
    },
    endedBy(value) { if (value) { state.endedBySeen = true; end('explicit-end'); update(); } },
    sessionRemoved() { state.sessionRemovedSeen = true; state.errorCategory = 'session-removed'; end('session-removed'); update(); },
    end,
    error(category) { state.errorCategory = category; update(); },
  };
}
