'use strict';

/**
 * P15 — عمود SQL غير موجود في المخطط.
 *
 * يمسح كل استعلام SQL مكتوب في src/ ويستخرج أسماء الأعمدة، ثم يتحقق منها
 * مقابل المخطط الحيّ. هذا هو الشكل العام لثغرة P07.
 *
 * كود خروج: 0 = وُجد عمود غير موجود، 2 = لم يتكرر، 3 = غير قابل للتطبيق.
 */

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, say, section, finish, openDb, hasTable } = require('./_lib');

/** يستخرج أعمدة من مقطع "SELECT a, b, c FROM t". */
function selectColumns(sql) {
  const m = /SELECT\s+([\s\S]*?)\s+FROM\s+([A-Za-z_][\w]*)/i.exec(sql);
  if (!m) return null;
  const list = m[1];
  if (/\b(COUNT|SUM|AVG|MIN|MAX|GROUP_CONCAT)\s*\(/i.test(list)) return { table: m[2], columns: [] };
  const cols = list
    .split(',')
    .map((c) => c.trim().split(/\s+AS\s+/i)[0].trim())
    .filter((c) => /^[A-Za-z_][\w]*$/.test(c) && c !== '*')
    .map((c) => c.replace(/^.*\./, ''));
  return { table: m[2], columns: [...new Set(cols)] };
}

/** يستخرج أعمدة من مقطع "UPDATE t SET a = ?, b = ?". */
function updateColumns(sql) {
  const m = /UPDATE\s+(?:OR\s+\w+\s+)?([A-Za-z_][\w]*)\s+SET\s+([\s\S]*?)(?:\s+WHERE\b|$)/i.exec(sql);
  if (!m) return null;
  const cols = m[2]
    .split(',')
    .map((c) => c.trim().split('=')[0].trim())
    .filter((c) => /^[A-Za-z_][\w]*$/.test(c));
  return { table: m[1], columns: [...new Set(cols)] };
}

/** يستخرج أعمدة من مقطع "INSERT INTO t (a, b) VALUES". */
function insertColumns(sql) {
  const m = /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+([A-Za-z_][\w]*)\s*\(([^)]+)\)/i.exec(sql);
  if (!m) return null;
  const cols = m[2].split(',').map((c) => c.trim()).filter((c) => /^[A-Za-z_][\w]*$/.test(c));
  return { table: m[1], columns: [...new Set(cols)] };
}

/** يستخرج كل سلاسل SQL من ملف. */
function sqlStrings(src) {
  const out = [];
  const re = /`([^`]*)`|'((?:[^']|'')*)'|"((?:[^"]|"")*)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const text = m[1] ?? m[2] ?? m[3] ?? '';
    if (/\b(SELECT|INSERT\s+INTO|UPDATE)\b/i.test(text)) out.push(text.replace(/''/g, "'"));
  }
  return out;
}

function main() {
  const srcDir = path.join(REPO_ROOT, 'src');
  if (!fs.existsSync(srcDir)) {
    finish({
      id: 'P15', slug: 'sql-column-not-in-schema', title: 'عمود SQL غير موجود في المخطط',
      severity: 'high', area: 'reliability', refs: ['src/**/*.js'],
      claim: 'كل عمود يُستعمل في استعلام يجب أن يكون موجوداً في المخطط.',
      expected: 'كل استعلام ينجح.', observed: 'لا يوجد src/.', impact: '-', fix: '-', reproduced: false,
    });
  }

  const db = openDb();
  const schemaCache = new Map();
  const columnsOf = (table) => {
    if (schemaCache.has(table)) return schemaCache.get(table);
    let cols = null;
    if (hasTable(db, table)) {
      cols = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
    }
    schemaCache.set(table, cols);
    return cols;
  };

  const problems = [];
  const checked = { statements: 0, tables: new Set() };

  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.name.endsWith('.js')) continue;
      const rel = path.relative(REPO_ROOT, p).replace(/\\/g, '/');
      const src = fs.readFileSync(p, 'utf8');
      const lines = src.split('\n');
      // رقم السطر لكل موضع في المصدر
      const lineOf = (index) => src.slice(0, index).split('\n').length;

      for (const sql of sqlStrings(src)) {
        checked.statements += 1;
        for (const parser of [selectColumns, updateColumns, insertColumns]) {
          const parsed = parser(sql);
          if (!parsed) continue;
          const { table, columns } = parsed;
          if (!columns.length) continue;
          checked.tables.add(table);
          const known = columnsOf(table);
          if (!known) continue; // الجدول غير موجود أصلاً — ليس خطأ عمود
          const missing = columns.filter((c) => !known.has(c));
          if (missing.length) {
            const idx = src.indexOf(sql);
            problems.push({
              rel,
              line: lineOf(Math.max(0, idx)),
              table,
              missing,
              sql: sql.replace(/\s+/g, ' ').slice(0, 160),
            });
          }
        }
      }
      void lines;
    }
  };
  walk(srcDir);

  section('نطاق الفحص');
  say(`مستعلامات SQL مفحوصة: ${checked.statements}`);
  say(`جداول مذكورة: ${[...checked.tables].join(', ') || '—'}`);

  section('أعمدة مستعملة وغير موجودة في المخطط');
  if (!problems.length) say('لا شيء — كل عمود مستعمل موجود في المخطط.');
  for (const p of problems) {
    say(`${p.rel}:${p.line}  جدول ${p.table}  ⇒  ${p.missing.join(', ')}`);
    say(`    ${p.sql}`);
  }

  const reproduced = problems.length > 0;

  finish({
    id: 'P15',
    slug: 'sql-column-not-in-schema',
    title: 'عمود SQL مستعمل وغير موجود في المخطط',
    severity: 'high',
    area: 'reliability',
    refs: problems.length ? problems.slice(0, 12).map((p) => `${p.rel}:${p.line}`) : ['src/**/*.js'],
    claim:
      'كل عمود يظهر في استعلام SQL داخل src/ يجب أن يكون موجوداً في مخطط القاعدة الحقيقية. '
      + 'العمود الناقص يجعل الاستعلام يرمي استثناءً وقت التشغيل لا وقت البناء.',
    expected:
      'أن ينجح كل استعلام. أي عمود ناقص يظهر كخطأ SQL يُبتلع في طبقة الاستدعاء، '
      + 'فيظهر للمستخدم كـ"الخاصية غير موجودة" لا كخطأ برمجي.',
    observed: problems.length
      ? `${problems.length} موضعاً:\n${problems.map((p) => `  ${p.rel}:${p.line} — جدول ${p.table}: ${p.missing.join(', ')}`).join('\n')}`
      : `لا شيء. فحص ${checked.statements} استعلاماً على ${checked.tables.size} جدولاً.`,
    impact:
      'المسار الذي يحوي الاستعلام يفشل صامتاً. في حالة التحقق من تفعيل المنتجات '
      + 'الرقمية، هذا يعني أن التحقق لا يعمل أبداً ولا أحد يعرف. '
      + 'قد تكون آثاره مالية: مسار تحقق لا ينفّذ يبدو كأنه نجح.',
    fix:
      'صحّح اسم العمود في الاستعلام. ولمنع تكرارها:\n'
      + '- أضف اختباراً ينفّذ كل مسار تحقق على صف حقيقي في قاعدة معزولة؛\n'
      + '- أضف فحصاً في CI يمرّ على المخطط الحيّ ويقارنه بالأعمدة المستعملة '
      + '(هذا الـproof نفسه).',
    reproduced,
  });
}

main();
