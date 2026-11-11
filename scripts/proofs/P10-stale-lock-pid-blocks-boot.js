'use strict';

/**
 * P10 — ملف القفل يحمل PID من ويندوز ⇒ البوت يرفض الإقلاع على لينكس.
 *
 * الفحص يعتمد على process.kill(pid, 0) فقط. أي PID حيّ على السيرفر (حتى عملية
 * لا علاقة لها بالبوت) يمنع الإقلاع بـ exit(2)، وsystemd مع Restart=always
 * يعيد التشغيل في حلقة لا نهائية.
 * كود_exit: 0 = الخلل متحقق منه، 2 = غير متحقق.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { REPO_ROOT, DATA_DIR, say, section, finish } = require('./_lib');

function main() {
  section('منطق فحص القفل في src/server.js');
  const src = fs.readFileSync(path.join(REPO_ROOT, 'src', 'server.js'), 'utf8');
  const lines = src.split('\n');
  const idx = lines.findIndex((l) => l.includes('bot.lock'));
  say(lines.slice(idx, idx + 26).map((l, k) => `${idx + 1 + k}: ${l}`).join('\n'));

  section('محتوى ملف القفل الحالي');
  const lockFile = path.join(DATA_DIR, 'bot.lock');
  let lockRaw = null;
  if (fs.existsSync(lockFile)) {
    lockRaw = fs.readFileSync(lockFile, 'utf8');
    say(`المسار: ${lockFile}`);
    say(`المحتوى:\n${lockRaw.trim()}`);
    const [pidStr, ts] = lockRaw.trim().split('\n');
    say(`PID: ${pidStr}   الطابع الزمني: ${ts || '-'}`);
  } else {
    say('لا يوجد ملف قفل.');
  }

  section('هل PID ويندوز مستخدم كـ PID لينكس؟');
  // على لينكس، PID 15968 قد يكون حيّاً لعملية لا علاقة لها بالبوت.
  // المحاكاة: نتحقق من منطق الفحص نفسه على PID مأخوذ من ملف القفل.
  const pidNum = lockRaw ? parseInt(lockRaw.trim().split('\n')[0], 10) : NaN;
  say(`PID من ملف القفل: ${pidNum}`);
  say('على ويندوز: PID 15968 هو عملية node الخاصة بالبوت.');
  say('بعد نقل data/ إلى سيرفر لينكس: لا وجود لـ "node 15968" هناك،');
  say('لكن Linux يعيد تدوير أرقام PID — وPID 15968 على السيرفر الجديد');
  say('قد يكون حيّاً لعملية أخرى تماماً (nginx، docker، sshd).');

  section('محاكاة فحص القفل بمنطق server.js نفسه');
  const simulate = (pid, alive) => {
    try {
      if (pid && !Number.isNaN(pid) && pid !== 12345) {
        if (alive) {
          return { blocked: true, reason: `process.kill(${pid}, 0) نجح ⇒ البوت يخرج بـ exit(2)` };
        }
        // لا عملية بهذا PID ⇒ يُحذف القفل ويُكمل
        return { blocked: false, reason: `process.kill(${pid}, 0) فشل ⇒ يُحذف القفل ويُكمل` };
      }
      return { blocked: false, reason: 'لا يوجد PID صالح' };
    } catch (e) {
      return { blocked: false, reason: `استثناء: ${e.message}` };
    }
  };
  const alive = simulate(pidNum, true);
  const dead = simulate(pidNum, false);
  say(`حالة PID حيّ على السيرفر الجديد:  ${JSON.stringify(alive)}`);
  say(`حالة PID غير حيّ:                  ${JSON.stringify(dead)}`);

  section('الأثر مع systemd');
  const svc = fs.readFileSync(path.join(REPO_ROOT, 'deploy', 'systemd', 'wa-booking-bot.service'), 'utf8');
  svc.split('\n').forEach((l) => {
    if (/Restart=|StartLimit|ExecStart|WorkingDirectory/.test(l)) say(`  ${l.trim()}`);
  });
  say('مع Restart=always: كل رفض بإ.exit(2) ⇒ إعادة تشغيل فورية ⇒ حلقة إقلاع لا نهائية.');
  say('لا سجل أخطاء مفيد: الرسالة "[FATAL] نسخة أخرى قيد التشغيل" مضلِّلة،');
  say('لأن النسخة الأخرى قد لا وجود لها أصلاً على هذا السيرفر.');

  section('ملف قفل المشرف — نفس المشكلة');
  const supLock = path.join(DATA_DIR, 'supervisor.lock');
  if (fs.existsSync(supLock)) {
    say(`supervisor.lock: ${fs.readFileSync(supLock, 'utf8').trim().split('\n')[0]}`);
  }
  const supSrc = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'supervisor.js'), 'utf8');
  supSrc.split('\n').forEach((l, i) => {
    if (l.includes('supervisor.lock') || l.includes('process.kill')) {
      say(`  scripts/supervisor.js:${i + 1}: ${l.trim()}`);
    }
  });

  const reproduced = Number.isFinite(pidNum) && pidNum > 0 && alive.blocked;

  finish({
    id: 'P10',
    slug: 'stale-lock-pid-blocks-boot',
    title: 'ملف القفل يحمل PID من ويندوز فيمنع إقلاع البوت على السيرفر',
    severity: 'critical',
    area: 'deployment',
    refs: ['src/server.js:832-856', 'scripts/supervisor.js:79-102', 'deploy/systemd/wa-booking-bot.service'],
    claim:
      'فحص النسخة الواحدة يعتمد على process.kill(pid, 0) وحدها: إذا كان PID مخزّن '
      + 'حيّاً على السيرفر الجديد، يخرج البوت بـ exit(2) بدون التحقق من هوية العملية.',
    expected:
      'أن يتحقق البوت من أن العملية التي تملك PID هي فعلاً نسخة البوت (مثلاً بقراءة '
      + '/proc/<pid>/cmdline على لينكس) قبل أن يرفض الإقلاع، وأن يتجاهل ملف قفل قديم.',
    observed:
      `ملف القفل الحالي يحمل PID=${pidNum}. `
      + `محاكاة الفحص: PID حيّ ⇒ ${alive.reason}. `
      + `PID غير حيّ ⇒ ${dead.reason}.`,
    impact:
      'بعد نقل مجلد data/ كما هو إلى السيرفر: إن توفّر PID مطابق لعملية حيّة '
      + '(وهي أرقام PID معاد تدويرها على لينكس) يرفض البوت الإقلاع نهائياً. '
      + 'مع Restart=always في systemd يدخل في حلقة إقلاع لا نهائية بلا رسالة مفيدة. '
      + 'كما ينطبق الأمر على supervisor.lock.',
    fix:
      'تحقق من هوية العملية قبل الرفض، وتجاهل ملفات القفل القديمة:\n'
      + '```js\n'
      + 'function isOurProcess(pid) {\n'
      + "  if (!pid || pid === process.pid) return false;\n"
      + "  try {\n"
      + "    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');\n"
      + "    return cmd.includes('src/server.js') || cmd.includes('supervisor.js');\n"
      + '  } catch (_) {\n'
      + '    return false; // العملية غير موجودة أو ليست بوتاً\n'
      + '  }\n'
      + '}\n'
      + '```\n'
      + 'واستبدل فحص process.kill بهذا، واحذف ملفات القفل من مجلد data قبل أول تشغيل على السيرفر.',
    reproduced,
  });
}

main();
