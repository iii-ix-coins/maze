// Preloaded into both servers during the parity run: makes room codes and ids reproducible (same sequence every run).
const crypto = require('node:crypto');
let s = 20260101;
const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
Math.random = rnd;
crypto.randomInt = (a, b) => { const min = b === undefined ? 0 : a, max = b === undefined ? a : b; return min + Math.floor(rnd() * (max - min)); };
let n = 0;
crypto.randomUUID = () => { n++; const h = x => (x >>> 0).toString(16).padStart(8, '0'); return `${h(n * 2654435761)}-${h(n).slice(4)}-4000-8000-${h(n * 40503)}${h(n * 7919).slice(4)}`; };
