'use strict';

/**
 * P09 — تغيير DATA_DIR على السيرفر يحوّل كل الإرسال إلى MOCK.
 *
 * openwa.isTestEnvironment و followups.isTestEnvironment يستنتجان "بيئة اختبار"
 * من مسار DATA_DIR لا من NODE_ENV. فأي نقل للبيانات إلى مجلد جديد يُطفئ
 * الرسائل والمتابعات بصمت.
 * كود الخروج: 0 = الخلل متحقق منه، 2 = غير متحقق.
 */

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { REPO_ROOT, say, section, finish } = require('./_lib');

/** يستخرج دالة من مصدر JS بتخطّي قائمة المعاملات. */
function extract(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start === -1) throw new Error(`${name} غير موجودة`);
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
  throw new Error(`تعذّر إغلاق ${name}`);
}

function main() {
  const openwaSrc = fs.readFileSync(path.join(REPO_ROOT, 'src', 'openwa.js'), 'utf8');
  const followupsSrc = fs.readFileSync(path.join(REPO_ROOT, 'src', 'followups.js'), 'utf8');

  section('openwa.isTestEnvironment في src/openwa.js');
  const oIdx = openwaSrc.split('\n').findIndex((l) => l.includes('function isTestEnvironment('));
  say(openwaSrc.split('\n').slice(oIdx, oIdx + 16).map((l, k) => `${oIdx + 1 + k}: ${l}`).join('\n'));

  section('followups.isTestEnvironment في src/followups.js');
  const fIdx = followupsSrc.split('\n').findIndex((l) => l.includes('function isTestEnvironment('));
  say(followupsSrc.split('\n').slice(fIdx, fIdx + 7).map((l, k) => `${fIdx + 1 + k}: ${l}`).join('\n'));

  section('أين تُستخدم النتيجة؟');
  openwaSrc.split('\n').forEach((l, i) => {
    if (l.includes('isTestEnvironment()')) say(`  src/openwa.js:${i + 1}: ${l.trim()}`);
  });
  followupsSrc.split('\n').forEach((l, i) => {
    if (l.includes('isTestEnvironment()')) say(`  src/followups.js:${i + 1}: ${l.trim()}`);
  });

  section('محاكاة الحالات');
  const prodData = path.resolve(REPO_ROOT, 'data');
  const runOpenwa = (dataDir, nodeEnv) => {
    const sandbox = {
      // __dirname لازم يكون src/ الحقيقي، وإلا حُسب PROD_DATA_DIR خطأً
      __dirname: path.join(REPO_ROOT, 'src'),
      // PROD_DATA_DIR ثابت على مستوى الموديول — لازم نعرّفه في البيئة المعزولة،
      // وإلا fell في catch وأعادت الدالة false دائماً.
      PROD_DATA_DIR: path.resolve(REPO_ROOT, 'data'),
      path: { resolve: path.resolve },
      process: { env: { DATA_DIR: dataDir, NODE_ENV: nodeEnv } },
      console,
    };
    vm.createContext(sandbox);
    vm.runInContext(`${extract(openwaSrc, 'isTestEnvironment')}\nthis.__f = isTestEnvironment;`, sandbox);
    return sandbox.__f();
  };

  const cases = [
    ['DATA_DIR = <repo>/data (الوضع الحالي على ويندوز)', prodData, 'production'],
    ['DATA_DIR = /opt/wa-booking-bot/data (المسار المقترح في الدليل)', '/opt/wa-booking-bot/data', 'production'],
    ['DATA_DIR = <repo>/data + NODE_ENV=production', prodData, 'production'],
    ['DATA_DIR = /opt/wa-booking-bot/data + NODE_ENV=test', '/opt/wa-booking-bot/data', 'test'],
  ];
  cases.forEach(([label, dir, env]) => {
    say(`${label}`);
    say(`  isTestEnvironment() ⇒ ${runOpenwa(dir, env)}`);
  });

  section('النتيجة');
  say('bool: isTestEnvironment = true ⇐ كل outbound.sendText / reply يتحوّل إلى MOCK،');
  say('ولا يُرسل أي شيء إلى واتساب. لا تحذير، لا خطأ في السجل — صمت تام.');
  say('followups.isTestEnvironment يوقف المتابعات التلقائية إذا احتوى مسار');
  say('DATA_DIR على السلسلة "wa-booking-" — وهي شائعة في أسماء مجلدات النشر.');

  const reproduced = runOpenwa('/opt/wa-booking-bot/data', 'production') === true;

  finish({
    id: 'P09',
    slug: 'data-dir-triggers-mock-sends',
    title: 'تغيير مسار DATA_DIR يحوّل كل الإرسال إلى وضع المحاكاة',
    severity: 'high',
    area: 'deployment',
    refs: ['src/openwa.js:9-24', 'src/followups.js:53-57'],
    claim:
      'openwa.isTestEnvironment تستنتج "بيئة اختبار" من أن DATA_DIR مختلف عن '
      + '<repo>/data، ولا تعتمد على NODE_ENV إلا في الاتجاه المعاكس. '
      + 'followups.isTestEnvironment توقف المتابعات إذا احوى المسار على "wa-booking-".',
    expected:
      'أن يكون وضع المحاكاة محكوماً بـ NODE_ENV=test صريحاً فقط، '
      + 'وأن يكون مسار البيانات قابلاً للتغيير بحرية.',
    observed:
      'DATA_DIR=<repo>/data ⇒ isTestEnvironment=false (إرسال حقيقي). '
      + 'DATA_DIR=/opt/wa-booking-bot/data ⇒ isTestEnvironment=true (كل الإرسال MOCK). '
      + 'حتى مع NODE_ENV=production.',
    impact:
      'النقل إلى السيرفر بالشكل الموصوف في DEPLOYMENT.md (DATA_DIR=/opt/wa-booking-bot/data) '
      + 'يُطفئ الرسائل فوراً بعد التشغيل: البوت يستقبل ويُسجّل ويرد على قاعدة البيانات، '
      + 'لكنه لا يرسل ولا كلمة للعميل ولا إشعاراً للأدمن. '
      + 'الخطأ يظهر كـ"العميل لا يرد" لا كخطأ تقني.',
    fix:
      'اجعل NODE_ENV هو المرجع الوحيد:\n'
      + '```js\n'
      + 'function isTestEnvironment() {\n'
      + "  return process.env.NODE_ENV === 'test';\n"
      + '}\n'
      + '```\n'
      + 'وفي followups.js احذف شرط المطابقة النصية للمسار، '
      + 'واعتمد على NODE_ENV=test وحده. '
      + 'أضف تحذيراً صريحاً عند الإقلاع إن طُلب المحاكاة في بيئة إنتاج.',
    reproduced,
  });
}

main();
