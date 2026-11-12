'use strict';

const fs = require('fs');
const cache = new Map();

/** Read a JSON snapshot once per file version; atomic writers naturally invalidate by mtime/size. */
function readJsonCached(file) {
  try {
    const stat = fs.statSync(file);
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.data;
    const text = fs.readFileSync(file, 'utf8');
    if (!text.trim()) return null;
    const data = JSON.parse(text);
    cache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, data });
    return data;
  } catch {
    cache.delete(file);
    return null;
  }
}

module.exports = { readJsonCached };
