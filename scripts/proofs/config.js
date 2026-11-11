'use strict';

/**
 * طبقة إعدادات حزمة التدقيق.
 *
 * الهدف: المستودع واحد يشترك فيه ناس كتير، وكل واحد يشغّل الأدلة على
 * بوتّه ويضيف بياناته. لذلك لا يوجد أي مسار مطلق مكتوب في الكود.
 *
 * ترتيب الأولوية لكل إعداد:
 *   1. متغيّر البيئة            BOT_REPO / BOT_DATA_DIR / AUDIT_SUBJECT / EVIDENCE_DIR
 *   2. audit.config.json         ملف محلي (غير متتبَّع) في جذر المستودع
 *   3. القيمة الافتراضية / الاكتشاف التلقائي
 *
 * شكل audit.config.json:
 * {
 *   "subjects": {
 *     "my-bot": {
 *       "title": "اسم يُعرض في الفهرس",
 *       "botRepo": "/path/to/my-bot",
 *       "dataDir": "/path/to/my-bot/data",
 *       "dbFile": "bot.db",
 *       "lockFile": "bot.lock",
 *       "moneyPath": { ... أسماء الجداول والأعمدة ... }
 *     }
 *   }
 * }
 */

const fs = require('node:fs');
const path = require('node:path');

const HARNESS_ROOT = path.resolve(__dirname, '..', '..');
const CONFIG_FILE = path.join(HARNESS_ROOT, 'audit.config.json');

/** يطبّع اسم subject لمعرّف مجلد آمن. */
function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'subject';
}

function readConfigFile() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (err) {
    throw new Error(`تعذّر قراءة ${CONFIG_FILE}: ${err.message}`);
  }
}

/** يبحث عن ملف .env محلي ويقرأ متغيّرات محدّدة منه. */
function readLocalEnv() {
  const out = {};
  for (const name of ['.env', '.env.audit']) {
    const p = path.join(HARNESS_ROOT, name);
    if (!fs.existsSync(p)) continue;
    try {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch (_) { /* تجاهل */ }
  }
  return out;
}

/** يخمّن subject id من مجلد البوت (اسم package.json أو اسم المجلد). */
function guessSubject(botRepo) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(botRepo, 'package.json'), 'utf8'));
    if (pkg && pkg.name) return slugify(pkg.name);
  } catch (_) { /* ليس مشروع node */ }
  try {
    return slugify(path.basename(path.resolve(botRepo)));
  } catch (_) {
    return 'subject';
  }
}

/** يبحث عن ملف قاعدة البيانات داخل مجلد البيانات. */
function findDbFile(dataDir, preferred) {
  const candidates = preferred ? [preferred] : ['bot.db', 'bookings.db', 'store.db', 'data.db', 'app.db'];
  for (const name of candidates) {
    const p = path.join(dataDir, name);
    if (fs.existsSync(p)) return p;
  }
  // بحث أعمق بعمق مستويين
  try {
    for (const e of fs.readdirSync(dataDir, { withFileTypes: true })) {
      if (!e.isFile()) continue;
      if (/\.(db|sqlite3?)$/i.test(e.name)) return path.join(dataDir, e.name);
    }
  } catch (_) { /* تجاهل */ }
  return path.join(dataDir, candidates[0]);
}

/** القيم الافتراضية لأسماء المسار المالي — قابلة للتعديل لكل بوت. */
const DEFAULT_MONEY_PATH = {
  bookingsTable: 'bookings',
  claimsTable: 'payment_claims',
  trustedPaymentsTable: 'trusted_payments',
  couponRedemptionsTable: 'coupon_redemptions',
  refundsTable: 'refunds',
  digitalOrdersTable: 'digital_orders',
  customersTable: 'customers',
  ownerAccountsTable: 'owner_accounts',
  ownerMembersTable: 'owner_members',
  chatLogTable: 'chat_log',
  paidStatus: 'paid',
  smsVerifiedColumn: 'sms_verified',
  refRawColumn: 'sms_ref_id',
  refNormalizedColumn: 'sms_ref_norm',
  providerColumn: 'sms_provider',
  customerNameColumn: 'customer_name',
  phoneColumns: ['requested_phone', 'whatsapp_phone', 'sender_phone'],
  bookingIdColumn: 'id',
  chatIdColumn: 'chat_id',
};

/**
 * يبني الإعدادات النهائية.
 * @param {object} [overrides] قيم تمرَّر من سطر الأوامر
 */
function resolve(overrides = {}) {
  const file = readConfigFile();
  const envFile = readLocalEnv();
  const env = { ...envFile, ...process.env };

  const subjectId = slugify(
    overrides.subject || env.AUDIT_SUBJECT || (file.defaultSubject) || 'default',
  );

  const subjectCfg = (file.subjects && file.subjects[subjectId]) || {};

  // 1) مسار البوت
  const botRepoRaw = overrides.botRepo || env.BOT_REPO || subjectCfg.botRepo;
  if (!botRepoRaw) {
    throw new Error(
      'لم يُحدَّد مسار البوت المُدقَّق.\n'
      + '  ضعه في audit.config.json:\n'
      + '    { "subjects": { "<id>": { "botRepo": "/path/to/bot" } } }\n'
      + '  أو مرّره في البيئة:  set BOT_REPO=/path/to/bot\n'
      + '  أو في سطر الأوامر:  --bot-repo /path/to/bot',
    );
  }
  const botRepo = path.resolve(botRepoRaw);
  if (!fs.existsSync(botRepo)) {
    throw new Error(`مسار البوت غير موجود: ${botRepo}`);
  }

  // 2) مجلد البيانات
  const dataDir = path.resolve(
    overrides.dataDir || env.BOT_DATA_DIR || subjectCfg.dataDir || path.join(botRepo, 'data'),
  );

  // 3) معرّف الـsubject الحقيقي
  const realSubject = slugify(subjectCfg.id || (subjectId === 'default' ? guessSubject(botRepo) : subjectId));

  // 4) مجلد الأدلة
  const evidenceRoot = path.resolve(
    overrides.evidenceDir || env.EVIDENCE_DIR || path.join(HARNESS_ROOT, 'evidence'),
  );
  const subjectDir = path.join(evidenceRoot, realSubject);

  // 5) ملف القاعدة
  const dbFile = findDbFile(dataDir, subjectCfg.dbFile || env.BOT_DB_FILE);

  const moneyPath = { ...DEFAULT_MONEY_PATH, ...(subjectCfg.moneyPath || {}) };

  return {
    harnessRoot: HARNESS_ROOT,
    subject: realSubject,
    subjectTitle: subjectCfg.title || realSubject,
    subjectDescription: subjectCfg.description || '',
    subjectNotes: subjectCfg.notes || '',
    botRepo,
    dataDir,
    dbFile,
    evidenceRoot,
    subjectDir,
    proofsDir: path.join(subjectDir, 'proofs'),
    screenshotsDir: path.join(subjectDir, 'screenshots'),
    baselineDir: path.join(subjectDir, 'baseline'),
    findingsFile: path.join(subjectDir, 'findings.json'),
    runFile: path.join(subjectDir, 'proof-run.json'),
    lockFile: subjectCfg.lockFile || 'bot.lock',
    moneyPath,
  };
}

/** يقرأ اسم subject من سطر الأوامر: --subject x --bot-repo y --data-dir z */
function fromArgv(argv = process.argv.slice(2)) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--subject' || a === '-s') out.subject = argv[++i];
    else if (a === '--bot-repo' || a === '-r') out.botRepo = argv[++i];
    else if (a === '--data-dir' || a === '-d') out.dataDir = argv[++i];
    else if (a === '--evidence-dir' || a === '-e') out.evidenceDir = argv[++i];
  }
  return out;
}

/** يطبع ملخّص الإعدادات — مفيد في سجل التشغيل. */
function describe(cfg) {
  return [
    `subject:      ${cfg.subject}${cfg.subjectTitle !== cfg.subject ? ` (${cfg.subjectTitle})` : ''}`,
    `botRepo:      ${cfg.botRepo}`,
    `dataDir:      ${cfg.dataDir}`,
    `dbFile:       ${cfg.dbFile}`,
    `evidenceDir:  ${cfg.subjectDir}`,
  ].join('\n');
}

module.exports = {
  HARNESS_ROOT,
  CONFIG_FILE,
  DEFAULT_MONEY_PATH,
  slugify,
  resolve,
  fromArgv,
  describe,
};
