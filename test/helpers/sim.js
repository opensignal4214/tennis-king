export function runFrames(fns, n, dt = 1 / 60) {
  for (let i = 0; i < n; i++) {
    for (const fn of fns) fn(dt);
  }
}
