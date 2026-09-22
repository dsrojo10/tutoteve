// Explicit allowlist: never return raw reports, addresses, IDs or SDP.
export function safeVideoStats(report, direction) {
  const videos = [];
  let pair;
  report.forEach(item => {
    if (item.type === 'transport' && item.selectedCandidatePairId) {
      pair = report.get(item.selectedCandidatePairId);
    }
  });
  if (!pair) report.forEach(item => {
    if (item.type === 'candidate-pair' && item.nominated && item.state === 'succeeded') pair = item;
  });
  const fields = direction === 'outbound'
    ? ['bytesSent', 'framesEncoded', 'framesSent', 'packetsSent']
    : ['bytesReceived', 'framesReceived', 'framesDecoded', 'framesDropped', 'packetsLost', 'jitter'];
  report.forEach(item => {
    if (item.type !== direction + '-rtp' || (item.kind || item.mediaType) !== 'video' || item.isRemote) return;
    const video = {};
    fields.forEach(key => { video[key] = Number.isFinite(item[key]) ? item[key] : null; });
    if (direction === 'outbound') video.qualityLimitationReason =
      ['none', 'cpu', 'bandwidth', 'other'].includes(item.qualityLimitationReason) ? item.qualityLimitationReason : null;
    const mime = report.get(item.codecId)?.mimeType;
    video.codec = typeof mime === 'string' && /^video\/[a-z0-9.-]+$/i.test(mime) ? mime : null;
    videos.push(video);
  });
  function candidate(id) {
    const item = report.get(id);
    return {
      type: ['host', 'srflx', 'prflx', 'relay'].includes(item?.candidateType) ? item.candidateType : null,
      protocol: ['udp', 'tcp'].includes(item?.protocol) ? item.protocol : null,
    };
  }
  return {
    video: videos,
    currentRoundTripTime: Number.isFinite(pair?.currentRoundTripTime) ? pair.currentRoundTripTime : null,
    selectedPair: pair ? { local: candidate(pair.localCandidateId), remote: candidate(pair.remoteCandidateId) } : null,
  };
}

export function pollStats(peer, direction, publish, enabled, schedule = setInterval, cancel = clearInterval) {
  if (!enabled) return () => {};
  let stopped = false;
  let busy = false;
  async function sample() {
    if (stopped || busy) return;
    if (peer.signalingState === 'closed') { stop(); return; }
    busy = true;
    try {
      const report = await peer.getStats();
      if (!stopped) publish(safeVideoStats(report, direction));
    } catch {
      if (!stopped) publish({ error: 'Estadísticas no disponibles.' });
    } finally { busy = false; }
  }
  const timer = schedule(sample, 3000);
  function stop() { stopped = true; cancel(timer); }
  sample();
  return stop;
}
