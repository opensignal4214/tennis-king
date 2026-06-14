export function withSeed(seed, fn) {
  const orig = Math.random;
  let s = seed >>> 0;
  Math.random = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}
