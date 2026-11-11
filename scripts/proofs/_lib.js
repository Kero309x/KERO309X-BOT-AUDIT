'use strict';

/**
 * أدوات مشتركة لحزمة إثباتات بوت واتساب.
 *
 * قاعدةEvidence: كل proof يقرأ القاعدة الحقيقية للتجربة في وضع read-only،
 * ويطبع أدلة قابلة لإعادة الإنتاج (deterministic) بعد تنقيح البيانات الشخصية.
 * لا يُكتب أي شيء في data/ ولا في قاعدة البوت.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const REPO_ROOT = process.env.BOT_REPO
  ? path.resolve(process.env.BOT_REPO)
  : path.resolve(__dirname, '..', '..');
const DATA_DIR = process.env.DATA_DIR || path.join(REPO_ROOT, 'data');
const DB_PATH = path.join(DATA_DIR, 'bot.db');
// مجلد الأدلة يتبع مكان السكربت نفسه: يعمل في ريبو البوت وفي ريبو التدقيق.
const EVIDENCE_DIR = process.env.EVIDENCE_DIR || path.resolve(__dirname, '..', '..', 'evidence');

/* ------------------------------------------------------------------ */
/* تنقيح PII — pseudonym ثابت مشتق بـ SHA-256                          */
/* ------------------------------------------------------------------ */

/** يولّد معرّفًا مستعارًا ثابتًا لنفس القيمة الأصلية. */
function pseudonym(prefix, value) {
  if (value === null || value === undefined || value === '') return `${prefix}-none`;
  const h = crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 8);
  return `${prefix}-${h}`;
}

/** يخفي رقم هاتف: يحتفظ برمز الدولة وآخر رقمين فقط. */
function maskPhone(value) {
  if (!value) return '';
  const s = String(value).replace(/\D/g, '');
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${s.slice(0, 4)}${'*'.repeat(Math.max(0, s.length - 6))}${s.slice(-2)}`;
}

/** يخفي أي معرّف نصي حساس (اسم، مرجع، معرّف عملية). */
function maskToken(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 2) return '*'.repeat(s.length);
  return `${s[0]}${'*'.repeat(Math.min(6, s.length - 2))}${s[s.length - 1]}`;
}

/**
 * يخفي أرقام الهواتف ومعرّفات المحادثات داخل أي نص — مصدر أو مخرجات اختبار.
 *
 * السبب: بعض الأكواد المُدقَّقة تحتوي أرقاماً حقيقية مكتوبة داخلها
 * (رقم عميل في شرط، أرقام المتجر في سجل الاختبارات). طباعة المصدر كما هو
 * يعني نشر هذه الأرقام في مستودع عام.
 *
 * القواعد بالترتيب —前面的 matched أولاً:
 *   +201234567890  رقم دولي
 *   01234567890    رقم محمول مصري
 *   201234567890@c.us / @lid   معرّف محادثة
 *   201234567890   معرّف محادثة بلا لاحقة
 *   123456789012345  معرّف LID (15 رقماً)
 */
function maskSource(text) {
  if (text === null || text === undefined) return text;
  return String(text)
    .replace(/\+20(1[0125]\d{8})\b/g, (m, n) => `+20${maskPhone(n)}`)
    .replace(/\b(01[0125]\d{8})\b/g, (m) => maskPhone(m))
    .replace(/\b(20\d{10})@(c\.us|lid)\b/g, (m, id, dom) => `${id.slice(0, 4)}******${id.slice(-2)}@${dom}`)
    .replace(/\b(20\d{10})\b/g, (m, id) => `${id.slice(0, 4)}******${id.slice(-2)}`)
    .replace(/\b(\d{15})\b/g, (m) => `${m.slice(0, 6)}*******${m.slice(-2)}`);
}

/**
 * يخفي الأسماء داخل التسميات النصية (مثل اسم مزوّد الخدمة).
 * كل كلمة من 4 محارف فأكثر تُستبدل بحرفها الأول وثلاث نجوم.
 */
function maskLabel(text) {
  if (!text) return '';
  return String(text).replace(/[\p{L}\p{N}]{4,}/gu, (w) => `${w[0]}***`);
}

/* ------------------------------------------------------------------ */
/* قاعدة البيانات — للقراءة فقط                                       */
/* ------------------------------------------------------------------ */

let _db = null;

/**
 * يحمّل better-sqlite3 من شجرة البوت المُدقَّقة، لا من مكان السكربت.
 * ضروري لأن حزمة الأدلة تعمل من ريبو مستقل (repo التدقيق) لا من ريبو البوت.
 */
function requireDb() {
  try {
    // eslint-disable-next-line global-require
    return require('better-sqlite3');
  } catch (err) {
    const fromBot = path.join(REPO_ROOT, 'node_modules', 'better-sqlite3');
    if (fs.existsSync(fromBot)) {
      // eslint-disable-next-line global-require, import/no-dynamic-require
      return require(fromBot);
    }
    throw new Error(
      `تعذّر تحميل better-sqlite3. ثبّتها في ريبو البوت (${REPO_ROOT}) `
      + `أو اضبط BOT_REPO ليشير إلى شجرة البوت. السبب الأصلي: ${err.message}`,
    );
  }
}

/**
 * يفتح قاعدة البوت في وضع read-only.
 * @returns {import('better-sqlite3').Database}
 */
function openDb() {
  if (_db) return _db;
  if (!fs.existsSync(DB_PATH)) {
    throw new Error(`قاعدة البوت غير موجودة: ${DB_PATH}`);
  }
  const Database = requireDb();
  _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  return _db;
}

function closeDb() {
  if (_db) {
    try { _db.close(); } catch (_) { /* already closed */ }
    _db = null;
  }
}

/* ------------------------------------------------------------------ */
/* إطار الـ finding                                                     */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

const lines = [];

/** يطبع سطر في تقرير الـ finding الحالي. */
function say(text = '') {
  // كل نص مطبوع يمرّ بقناع الأرقام — لا يُنشر رقم هاتف أو معرّف محادثة.
  lines.push(typeof text === 'string' ? maskSource(text) : text);
}

/**
 * يبني تقرير finding موحّد الشكل.
 * @param {object} f
 * @param {string} f.id            معرّف الدليل مثل P01
 * @param {string} f.slug          slug قصير
 * @param {string} f.title         العنوان
 * @param {string} f.severity      critical | high | medium | low
 * @param {string} f.area          المجال
 * @param {string[]} f.refs         مراجع file:line
 * @param {string} f.claim         الادعاء القابل للإثبات
 * @param {string} f.expected      السلوك المتوقع
 * @param {string} f.observed      السلوك المرصود
 * @param {boolean} f.reproduced   هل تكرر الخلل فعلاً؟
 * @param {string} f.impact        الأثر
 * @param {string} f.fix           الإصلاح المقترح
 */
function report(f) {
  const verdict = f.reproduced ? 'REPRODUCED' : 'NOT REPRODUCED';
  const out = [];
  out.push(`# ${f.id} — ${f.title}`);
  out.push('');
  out.push(`- **Severity:** ${f.severity}`);
  out.push(`- **Area:** ${f.area}`);
  out.push(`- **Refs:** ${f.refs.join(', ')}`);
  out.push(`- **Verdict:** ${verdict}`);
  out.push('');
  out.push('## Claim');
  out.push('');
  out.push(maskSource(f.claim));
  out.push('');
  out.push('## Expected');
  out.push('');
  out.push(maskSource(f.expected));
  out.push('');
  out.push('## Observed');
  out.push('');
  out.push(maskSource(f.observed));
  out.push('');
  out.push('## Impact');
  out.push('');
  out.push(maskSource(f.impact));
  out.push('');
  out.push('## Fix');
  out.push('');
  out.push(maskSource(f.fix));
  out.push('');
  out.push('## Raw output');
  out.push('');
  out.push('```');
  out.push(...lines);
  out.push('```');
  out.push('');
  return { text: out.join('\n'), finding: { ...f, observed: undefined, claim: undefined } };
}

/**
 * ينهي الـ proof: يطبع التقرير، يحفظه في evidence، ويحدّد كود الخروج.
 * كود 0 = الخلل موجود ومُثبَت. كود 2 = الخلل غير موجود (إما مُصلَح أو لم يتكرر).
 */
function finish(f) {
  const r = report(f);
  process.stdout.write(r.text);
  try {
    fs.mkdirSync(path.join(EVIDENCE_DIR, 'proofs'), { recursive: true });
    const outPath = path.join(EVIDENCE_DIR, 'proofs', `${f.id}-${f.slug}.md`);
    fs.writeFileSync(outPath, r.text, 'utf8');
  } catch (err) {
    process.stderr.write(`[proofs] تعذّر حفظ التقرير: ${err.message}\n`);
  }
  // سجّل في findings.json للترتيب الآلي
  try {
    const idxPath = path.join(EVIDENCE_DIR, 'findings.json');
    let idx = { generatedAt: null, findings: [] };
    if (fs.existsSync(idxPath)) {
      idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    }
    idx.findings = idx.findings.filter((x) => x.id !== f.id);
    idx.findings.push({
      id: f.id,
      slug: f.slug,
      title: maskSource(f.title),
      severity: f.severity,
      area: f.area,
      refs: f.refs,
      verdict: f.reproduced ? 'REPRODUCED' : 'NOT REPRODUCED',
      impact: maskSource(f.impact),
      fix: maskSource(f.fix),
      evidence: `proofs/${f.id}-${f.slug}.md`,
    });
    idx.findings.sort((a, b) => {
      const s = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
      return s !== 0 ? s : a.id.localeCompare(b.id);
    });
    idx.generatedAt = new Date().toISOString();
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(idxPath, `${JSON.stringify(idx, null, 2)}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(`[proofs] تعذّر تحديث findings.json: ${err.message}\n`);
  }
  closeDb();
  process.exit(f.reproduced ? 0 : 2);
}

/** يطبع سطر ترويسة داخل التقرير. */
function section(title) {
  lines.push('');
  lines.push(`--- ${title} ---`);
}

module.exports = {
  REPO_ROOT,
  DATA_DIR,
  DB_PATH,
  EVIDENCE_DIR,
  pseudonym,
  maskPhone,
  maskToken,
  maskSource,
  maskLabel,
  requireDb,
  openDb,
  closeDb,
  say,
  section,
  report,
  finish,
};
