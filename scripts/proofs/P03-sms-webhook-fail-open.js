'use strict';

/**
 * P03 — مسار webhook الخاص بالرسائل البنكية يفتح نفسه عند غياب المفتاح
 *       في أي بيئة غير production.
 *
 * كود الخروج: 0 = الخلل متحقق منه، 2 = غير متحقق.
 */

const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, say, section, finish } = require('./_lib');

function main() {
  const pvFile = path.join(REPO_ROOT, 'src', 'payment_verifier.js');
  const src = fs.readFileSync(pvFile, 'utf8');
  const lines = src.split('\n');

  section('verifyWebhookAuth في src/payment_verifier.js');
  const idx = lines.findIndex((l) => l.includes('function verifyWebhookAuth('));
  if (idx >= 0) {
    say(lines.slice(idx, idx + 22).map((l, k) => `${idx + 1 + k}: ${l}`).join('\n'));
  }

  section('المسارات التي تستخدمه في src/server.js');
  const serverSrc = fs.readFileSync(path.join(REPO_ROOT, 'src', 'server.js'), 'utf8');
  serverSrc.split('\n').forEach((l, i) => {
    if (l.includes('verifyWebhookAuth')) say(`src/server.js:${i + 1}: ${l.trim()}`);
  });

  section('المسار البديل: توقيع webhook الرئيسي (fail-closed) للمقارنة');
  const sIdx = serverSrc.split('\n').findIndex((l) => l.includes('function verifySignature'));
  if (sIdx >= 0) {
    const sl = serverSrc.split('\n');
    say(sl.slice(sIdx, sIdx + 16).map((l, k) => `${sIdx + 1 + k}: ${l}`).join('\n'));
  }

  section('محاكاة السلوك الفعلي لـ verifyWebhookAuth');
  // ننفّذ الدالة الفعلية المستخرجة من المصدر، بمفتاح مضبوط ثم بدونه.
  const fnText = (() => {
    const start = src.indexOf('function verifyWebhookAuth(');
    let paren = 0;
    let bodyStart = -1;
    for (let j = src.indexOf('(', start); j < src.length; j += 1) {
      if (src[j] === '(') paren += 1;
      else if (src[j] === ')') {
        paren -= 1;
        if (paren === 0) { bodyStart = src.indexOf('{', j); break; }
      }
    }
    let depth = 0;
    for (let j = bodyStart; j < src.length; j += 1) {
      if (src[j] === '{') depth += 1;
      else if (src[j] === '}') { depth -= 1; if (depth === 0) return src.slice(start, j + 1); }
    }
    return '';
  })();

  // eslint-disable-next-line global-require
  const vm = require('node:vm');
  const runCase = (env, cfg, label) => {
    const sandbox = {
      config: { httpsms: { apiKey: cfg } },
      process: { env: { ...env } },
      console,
    };
    vm.createContext(sandbox);
    vm.runInContext(`${fnText}\nthis.__f = verifyWebhookAuth;`, sandbox);
    // rawHeaders موجود دائماً في طلب Express حقيقي — نضبطه لنمذج الطلب كما يصل فعلاً.
    const req = { headers: {}, query: {}, rawHeaders: [] };
    const r = sandbox.__f(req);
    say(`${label}`);
    say(`  NODE_ENV=${env.NODE_ENV}  configuredKey=${cfg ? 'present' : '(absent)'}`);
    say(`  request بلا ترويسة Authorization ⇒ ترجع: ${r}`);
    return r;
  };

  const caseNoKeyProd = runCase({ NODE_ENV: 'production' }, '', 'الحالة A — لا مفتاح + production');
  const caseNoKeyStaging = runCase({ NODE_ENV: 'staging' }, '', 'الحالة B — لا مفتاح + staging');
  const caseNoKeyDev = runCase({ NODE_ENV: 'development' }, '', 'الحالة C — لا مفتاح + development');
  const caseNoKeyUndef = runCase({}, '', 'الحالة D — لا مفتاح + NODE_ENV غير محدد');
  const caseKeyProd = runCase({ NODE_ENV: 'production' }, 'secret-key-abc', 'الحالة E — مفتاح موجود + production');

  section('النتيجة');
  say('في بيئة production فقط يُرفض الطلب عند غياب المفتاح (fail-closed).');
  say('في أي بيئة أخرى (staging / development / NODE_ENV غير محدد) يُقبل الطلب بلا أي مفتاح.');

  const reproduced = caseNoKeyProd === false
    && (caseNoKeyStaging === true || caseNoKeyDev === true || caseNoKeyUndef === true)
    && caseKeyProd === false;

  finish({
    id: 'P03',
    slug: 'sms-webhook-fail-open',
    title: 'webhook الخاص بالرسائل البنكية مفتوح في كل بيئة غير production',
    severity: 'critical',
    area: 'security',
    refs: ['src/payment_verifier.js:52-71', 'src/server.js:466-467'],
    claim:
      'verifyWebhookAuth تُرجع `process.env.NODE_ENV !== \'production\'` عند غياب المفتاح، '
      + 'وتُرجع true أيضاً عند غياب الترويسة عندما لا يكون NODE_ENV=test.',
    expected:
      'الفشل مغلق دائماً: غياب المفتاح أو غياب الترويسة يعني رفض الطلب، '
      + 'بغض النظر عن قيمة NODE_ENV.',
    observed:
      `NODE_ENV=production ⇒ ${caseNoKeyProd} (مغلق، سليم). `
      + `NODE_ENV=staging ⇒ ${caseNoKeyStaging}. `
      + `NODE_ENV=development ⇒ ${caseNoKeyDev}. `
      + `NODE_ENV غير محدد ⇒ ${caseNoKeyUndef}. `
      + `مع مفتاح صحيح ⇒ ${caseKeyProd}.`,
    impact:
      'أي نشر تجريبي أو بيئة إنتاج مضبوطة خطأ (مثلاً systemd بلا NODE_ENV) '
      + 'يجعل المسار يقبل أي طلب بلا مصادقة. الطلب المُزيف يدخل trusted_payments '
      + 'ويُطابَق مع حجز فيُسجَّل كدفعة حقيقية — أي تحويل رصيد غير مدفوع إلى "مدفوع".',
    fix:
      'اجعل الفشل مغلقاً دائماً:\n'
      + '```js\n'
      + 'function verifyWebhookAuth(req) {\n'
      + '  if (!req) return false;\n'
      + '  const headers = req.headers || {};\n'
      + '  const query = req.query || {};\n'
      + "  const configuredKey = (config.httpsms && config.httpsms.apiKey)\n"
      + "    || process.env.HTTPSMS_API_KEY || process.env.WEBHOOK_SECRET || '';\n"
      + "  if (!configuredKey) return false;\n"
      + "  const headerKey = headers['x-api-key'] || headers['authorization']\n"
      + "    || query.api_key || query.token;\n"
      + '  if (!headerKey) return false;\n'
      + "  const cleanHeader = String(headerKey).replace(/^Bearer\\s+/i, '').trim();\n"
      + '  return safeEqual(cleanHeader, String(configuredKey).trim());\n'
      + '}\n```',
    reproduced,
  });
}

main();
