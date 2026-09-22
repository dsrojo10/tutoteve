import { isGuestRoute } from './mvp-utils.js';
if (isGuestRoute(location.search)) {
  document.getElementById('tuto-screen').hidden = true; document.getElementById('guest-screen').hidden = false;
  [['status', 'unused-status'], ['debug', 'unused-debug'], ['local-video', 'unused-local-video'], ['end-call', 'unused-end-call'], ['guest-status', 'status'], ['guest-debug', 'debug'], ['guest-local-video', 'local-video'], ['guest-end-call', 'end-call']].forEach(function (pair) { document.getElementById(pair[0]).id = pair[1]; });
  import('./guest.js');
} else { document.getElementById('tuto-screen').hidden = false; import('./sender.js'); }
