// Fails CI when the build exceeds the budgets in MASTER_PROMPT 4.4.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const TOTAL_LIMIT = 5 * 1024 * 1024;
const JS_GZIP_LIMIT = 400 * 1024;
const FILE_LIMIT = 1500;

const dir = process.argv[2] ?? 'dist';
let total = 0;
let jsGzip = 0;
let files = 0;
function walk(d) {
  for (const name of readdirSync(d)) {
    const p = join(d, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else {
      files++;
      total += s.size;
      if (p.endsWith('.js')) jsGzip += gzipSync(readFileSync(p)).length;
    }
  }
}
walk(dir);
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`files ${files}/${FILE_LIMIT}, total ${kb(total)}/${kb(TOTAL_LIMIT)}, js gzip ${kb(jsGzip)}/${kb(JS_GZIP_LIMIT)}`);
const failures = [];
if (files > FILE_LIMIT) failures.push('file count');
if (total > TOTAL_LIMIT) failures.push('total size');
if (jsGzip > JS_GZIP_LIMIT) failures.push('JavaScript gzip size');
if (failures.length) {
  console.error(`Budget exceeded: ${failures.join(', ')}`);
  process.exit(1);
}
