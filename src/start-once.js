export function createSingleStart(start) {
  let started = false;
  return function startOnce() {
    if (started) return false;
    started = true;
    start();
    return true;
  };
}
