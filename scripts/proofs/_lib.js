'use strict';

/**
 * أدوات مشتركة لحزمة إثباتات بوت واتساب.
 *
 * قاعدةEvidence: كل proof يقرأ القاعدة الحقيقية للتجربة في وضع read-only،
 * ويطبع أدلة قابلة لإعادة الإنتاج (deterministic) بعد تنقية البيانات الشخصية.
 * لا يُكتب أي شيء في data/ ولا في قاعدة البوت.
 *
 * الإعدادات تأتي من scripts/proofs/config.js — لا مسارات مطلقة هنا.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const cfgMod = require('./config');

const cfg = cfgMod.resolve(cfgMod.fromArgv());
const REPO_ROOT = cfg.botRepo;
const DATA_DIR = cfg.dataDir;
const DB_PATH = cfg.dbFile;
const EVIDENCE_DIR = cfg.subjectDir;

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

/** هل الجدول موجود في القاعدة؟ */
function hasTable(db, name) {
  try {
    return !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
  } catch (_) {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* إطار الـ finding                                                     */
/* ------------------------------------------------------------------ */

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

const lines = [];

/** يطبع سطر في تقرير الـ finding الحالي. */
function say(text = '') {
  // كل نص مطبوع يمرّ بقناع الأرقام — لا يُنشر رقم هاتف أو معرّف محادثة.
  lines.push(typeof text === 'string' ? maskSource(text) : text);
}

/** عنوان قسم داخل التقرير. */
function section(title) {
  lines.push('');
  lines.push(`--- ${title} ---`);
}

/**
 * يبني تقرير finding موحّد الشكل.
 * @param {object} f
 * @param {string} f.id            معرّف الدليل مثل P01
 * @param {string} f.slug          slug قصير
 * @param {string} f.title         العنوان
 * @param {string} f.severity      critical | high | medium | low | info
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
  out.push(`- **Subject:** ${cfg.subject}`);
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

/** يكتب تقرير الـfinding في مجلد أدلة الـsubject ويحدّث findings.json. */
function writeEvidence(f, verdict) {
  const r = report(f);
  try {
    fs.mkdirSync(cfg.proofsDir, { recursive: true });
    const outPath = path.join(cfg.proofsDir, `${f.id}-${f.slug}.md`);
    fs.writeFileSync(outPath, r.text, 'utf8');
  } catch (err) {
    process.stderr.write(`[proofs] تعذّر حفظ التقرير: ${err.message}\n`);
  }
  try {
    let idx = { generatedAt: null, subject: cfg.subject, findings: [] };
    if (fs.existsSync(cfg.findingsFile)) {
      idx = JSON.parse(fs.readFileSync(cfg.findingsFile, 'utf8'));
    }
    idx.subject = cfg.subject;
    idx.findings = (idx.findings || []).filter((x) => x.id !== f.id);
    idx.findings.push({
      id: f.id,
      slug: f.slug,
      title: maskSource(f.title),
      severity: f.severity,
      area: f.area,
      refs: f.refs,
      verdict,
      impact: maskSource(f.impact),
      fix: maskSource(f.fix),
      evidence: `proofs/${f.id}-${f.slug}.md`,
    });
    idx.findings.sort((a, b) => {
      const s = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
      return s !== 0 ? s : a.id.localeCompare(b.id);
    });
    idx.generatedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(cfg.findingsFile), { recursive: true });
    fs.writeFileSync(cfg.findingsFile, `${JSON.stringify(idx, null, 2)}\n`, 'utf8');
  } catch (err) {
    process.stderr.write(`[proofs] تعذّر تحديث findings.json: ${err.message}\n`);
  }
  return r;
}

/**
 * ينهي الـ proof: يطبع التقرير، يحفظه في evidence، ويحدّد كود الخروج.
 * كود 0 = الخلل موجود ومُثبَت. كود 2 = الخلل غير موجود (إما مُصلَح أو لم يتكرر).
 */
function finish(f) {
  const r = writeEvidence(f, f.reproduced ? 'REPRODUCED' : 'NOT REPRODUCED');
  process.stdout.write(r.text);
  closeDb();
  process.exit(f.reproduced ? 0 : 2);
}

/**
 * ينهي الـ proof بأنه غير قابل للتطبيق على هذا الـsubject.
 * يُستخدم للأدلة المرتبطة ببوت معيّن عندما يُشغَّل against بوت آخر.
 * كود 3 = غير قابل للتطبيق (ليس فشلاً).
 */
function notApplicable(f, reason) {
  const finding = {
    ...f,
    reproduced: false,
    claim: f.claim || '(غير مطبَّق)',
    expected: f.expected || '(غير مطبَّق)',
    observed: `غير قابل للتطبيق على هذا الـsubject: ${reason}`,
    impact: f.impact || '(غير مطبَّق)',
    fix: f.fix || '(غير مطبَّق)',
  };
  const r = writeEvidence(finding, 'NOT APPLICABLE');
  process.stdout.write(r.text);
  closeDb();
  process.exit(3);
}

/**
 * يتحقق من شرط تطبيق الدليل على هذا الـsubject.
 * @returns {string|null} سبب عدم Applicability، أو null إذا كان قابلاً للتطبيق
 */
function precondition(fn, reason) {
  try {
    return fn() ? null : reason;
  } catch (err) {
    return `${reason} (${err.message})`;
  }
}

module.exports = {
  cfg,
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
  hasTable,
  say,
  section,
  report,
  finish,
  notApplicable,
  precondition,
};
