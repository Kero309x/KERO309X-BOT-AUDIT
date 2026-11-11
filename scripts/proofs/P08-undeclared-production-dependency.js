'use strict';

/**
 * P08 — اعتماديات مستخدمة في مسار الإنتاج غير معلنة في package.json.
 *
 * we_api.js يستدعي playwright / playwright-core، وكلاهما devDependency فقط،
 * بينما الكود في مسار الإنتاج. عند npm ci --omit=dev على السيرفر يفشل الاستيراد.
 * كود الخروج: 0 = الخلل متحقق منه، 2 = غير متحقق.
 */

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, say, section, finish } = require('./_lib');

const BUILTINS = new Set([
  'assert', 'buffer', 'child_process', 'cluster', 'console', 'constants', 'crypto',
  'dgram', 'dns', 'domain', 'events', 'fs', 'http', 'http2', 'https', 'inspector',
  'module', 'net', 'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls', 'trace_events',
  'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads', 'zlib',
]);

function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
  ]);
  const prodDeclared = new Set(Object.keys(pkg.dependencies || {}));

  section('الاعتماديات المعلنة');
  say(`dependencies: ${Object.keys(pkg.dependencies || {}).join(', ')}`);
  say(`devDependencies: ${Object.keys(pkg.devDependencies || {}).join(', ')}`);

  section('مسح كل الاستيرادات في src/');
  const srcDir = path.join(REPO_ROOT, 'src');
  const found = new Map(); // module -> [{file, line, prod:true/false}]
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const rel = path.relative(REPO_ROOT, p).replace(/\\/g, '/');
      const lines = fs.readFileSync(p, 'utf8').split('\n');
      lines.forEach((l, i) => {
        const m = l.match(/require\(\s*['"]([^'"]+)['"]\s*\)/);
        if (!m) return;
        const mod = m[1];
        if (mod.startsWith('.') || mod.startsWith('/') || mod.startsWith('node:')) return;
        if (BUILTINS.has(mod)) return;
        if (!found.has(mod)) found.set(mod, []);
        found.get(mod).push({ file: rel, line: i + 1 });
      });
    }
  };
  walk(srcDir);

  section('الاستيرادات الخارجية المستخدمة في src/');
  const missing = [];
  for (const [mod, uses] of [...found.entries()].sort()) {
    const isProd = !prodDeclared.has(mod);
    const status = declared.has(mod) ? (isProd ? 'devDependency فقط' : 'معلنة في dependencies') : 'غير معلنة إطلاقاً';
    say(`${mod}  [${status}]`);
    uses.slice(0, 4).forEach((u) => say(`    ${u.file}:${u.line}`));
    if (uses.length > 4) say(`    … و${uses.length - 4} موضعاً آخر`);
    if (!declared.has(mod) || isProd) missing.push({ mod, uses, status, isProd });
  }

  section('ماذا يحدث عند npm ci --omit=dev؟');
  const playwrightUses = found.get('playwright') || [];
  const coreUses = found.get('playwright-core') || [];
  say(`playwright: ${playwrightUses.length} استيراد`);
  say(`playwright-core: ${coreUses.length} استيراد`);
  say('كلاهما devDependency ⇒ لن يكون موجوداً في node_modules على السيرفر.');

  section('ماذا يفعل الكود عند فشل الاستيراد؟');
  const weSrc = fs.readFileSync(path.join(REPO_ROOT, 'src', 'we_api.js'), 'utf8').split('\n');
  coreUses.forEach((u) => {
    const idx = u.line - 1;
    const window = weSrc.slice(Math.max(0, idx - 3), idx + 10).map((l, k) => `${Math.max(0, idx - 3) + 1 + k}: ${l}`).join('\n');
    say(window);
    say('---');
  });

  section('محاكاة: require في بيئة بلا playwright');
  const fs2 = require('node:fs');
  const os = require('node:os');
  const tmp = fs2.mkdtempSync(path.join(os.tmpdir(), 'wa-proof-p08-'));
  try {
    const Module = require('node:module');
    const origResolve = Module._resolveFilename;
    Module._resolveFilename = function patched(request, ...rest) {
      if (request === 'playwright' || request === 'playwright-core') {
        const e = new Error(`Cannot find module '${request}'`);
        e.code = 'MODULE_NOT_FOUND';
        throw e;
      }
      return origResolve.call(this, request, ...rest);
    };
    let failed = false;
    let errMsg = '';
    try {
      // eslint-disable-next-line global-require
      require(path.join(REPO_ROOT, 'src', 'we_api.js'));
    } catch (err) {
      failed = true;
      errMsg = err.message;
    } finally {
      Module._resolveFilename = origResolve;
    }
    say(`محاولة تحميل src/we_api.js ⇒ ${failed ? `فشل: ${errMsg}` : 'نجح'}`);
    say('في الإنتاج هذا يعني: ميزة WE Family تسقط بصمت — لا استثناء ظاهر.');
  } finally {
    fs2.rmSync(tmp, { recursive: true, force: true });
  }

  const undeclared = missing.filter((m) => !declared.has(m.mod));
  const devOnlyUsedInProd = missing.filter((m) => m.isProd && declared.has(m.mod));
  const reproduced = undeclared.length > 0 || devOnlyUsedInProd.length > 0;

  finish({
    id: 'P08',
    slug: 'undeclared-production-dependency',
    title: 'اعتماديات في مسار الإنتاج غير معلنة أو مُعلنة dev فقط',
    severity: 'high',
    area: 'deployment',
    refs: ['src/we_api.js:18-29', 'package.json:31-39'],
    claim:
      'src/we_api.js — وهو في مسار الإنتاج — يستدعي playwright و playwright-core. '
      + 'كلاهما devDependency، وواحد منهما غير مذكور في package.json إطلاقاً.',
    expected:
      'كل اعتماد يستخدمه كود الإنتاج يجب أن يكون في dependencies، '
      + 'وإلا يفشل npm ci --omit=dev على السيرفر.',
    observed:
      `غير معلنة إطلاقاً: ${undeclared.length ? undeclared.map((m) => m.mod).join('، ') : 'لا شيء'}. `
      + `devDependency مستخدمة في الإنتاج: ${devOnlyUsedInProd.length ? devOnlyUsedInProd.map((m) => m.mod).join('، ') : 'لا شيء'}. `
      + 'محاكاة require في بيئة بلا playwright: الفشل لا يُترجم إلى رسالة واضحة.',
    impact:
      'بعد `npm ci --omit=dev` على السيرفر تفشل ميزات WE Family بصمت: '
      + 'الـcatch يبتلع الاستثناء فلا يظهر خطأ في السجلات، ولا يعرف المشغّل أن الميزة معطّلة. '
      + 'كما أن البناء حسب DEPLOYMENT.md يستخدم --omit=dev بالضبط.',
    fix:
      'انقل الاعتماديات المستخدمة في الإنتاج إلى dependencies:\n'
      + '```json\n'
      + '"dependencies": {\n'
      + '  "better-sqlite3": "^13.0.3",\n'
      + '  "dotenv": "^16.4.5",\n'
      + '  "express": "^4.21.2",\n'
      + '  "playwright": "^1.64.0",\n'
      + '  "playwright-core": "^1.64.0"\n'
      + '}\n'
      + '```\n'
      + 'أو اعزلها خلف lazy require مع رسالة خطأ صريحة:\n'
      + '```js\n'
      + "let chromium = null;\n"
      + "try { ({ chromium } = require('playwright-core')); }\n"
      + "catch (err) { console.error('[we_api] Playwright غير مثبّت — ميزة WE Family معطّلة:', err.message); }\n"
      + '```',
    reproduced,
  });
}

main();
