const invite = new URLSearchParams(location.search).get('invite');
if (invite) {
  document.getElementById('tuto-screen').hidden = true; document.getElementById('guest-screen').hidden = false;
  [['status', 'unused-status'], ['debug', 'unused-debug'], ['local-video', 'unused-local-video'], ['end-call', 'unused-end-call'], ['guest-status', 'status'], ['guest-debug', 'debug'], ['guest-local-video', 'local-video'], ['guest-end-call', 'end-call']].forEach(function (pair) { document.getElementById(pair[0]).id = pair[1]; });
  import('./guest.js');
} else { import('./sender.js'); }
