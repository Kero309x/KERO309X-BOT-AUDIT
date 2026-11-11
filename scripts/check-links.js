'use strict';

/** يتحقق إن كل رابط داخلي في المستودع بيشاور لملف موجود. */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  if (e.name === '.git' || e.name === 'node_modules') return [];
  return e.isDirectory() ? walk(p) : [p];
});

const mdFiles = walk(ROOT).filter((f) => f.endsWith('.md'));
let broken = 0;
let checked = 0;

for (const file of mdFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const re = /\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const href = m[1];
    if (/^(https?:|mailto:|#)/.test(href)) continue;
    const target = href.split('#')[0];
    if (!target) continue;
    checked += 1;
    const resolved = path.resolve(path.dirname(file), target);
    if (!fs.existsSync(resolved)) {
      broken += 1;
      console.log(`BROKEN  ${path.relative(ROOT, file)}  →  ${href}`);
    }
  }
}

console.log(`\nروابط داخلية مفحوصة: ${checked} — مكسورة: ${broken}`);
process.exit(broken ? 1 : 0);
