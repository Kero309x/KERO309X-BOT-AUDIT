# P10 — ملف القفل يحمل PID من ويندوز فيمنع إقلاع البوت على السيرفر

- **Severity:** critical
- **Area:** deployment
- **Refs:** src/server.js:832-856, scripts/supervisor.js:79-102, deploy/systemd/wa-booking-bot.service
- **Verdict:** REPRODUCED

## Claim

فحص النسخة الواحدة يعتمد على process.kill(pid, 0) وحدها: إذا كان PID مخزّن حيّاً على السيرفر الجديد، يخرج البوت بـ exit(2) بدون التحقق من هوية العملية.

## Expected

أن يتحقق البوت من أن العملية التي تملك PID هي فعلاً نسخة البوت (مثلاً بقراءة /proc/<pid>/cmdline على لينكس) قبل أن يرفض الإقلاع، وأن يتجاهل ملف قفل قديم.

## Observed

ملف القفل الحالي يحمل PID=15968. محاكاة الفحص: PID حيّ ⇒ process.kill(15968, 0) نجح ⇒ البوت يخرج بـ exit(2). PID غير حيّ ⇒ process.kill(15968, 0) فشل ⇒ يُحذف القفل ويُكمل.

## Impact

بعد نقل مجلد data/ كما هو إلى السيرفر: إن توفّر PID مطابق لعملية حيّة (وهي أرقام PID معاد تدويرها على لينكس) يرفض البوت الإقلاع نهائياً. مع Restart=always في systemd يدخل في حلقة إقلاع لا نهائية بلا رسالة مفيدة. كما ينطبق الأمر على supervisor.lock.

## Fix

تحقق من هوية العملية قبل الرفض، وتجاهل ملفات القفل القديمة:
```js
function isOurProcess(pid) {
  if (!pid || pid === process.pid) return false;
  try {
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return cmd.includes('src/server.js') || cmd.includes('supervisor.js');
  } catch (_) {
    return false; // العملية غير موجودة أو ليست بوتاً
  }
}
```
واستبدل فحص process.kill بهذا، واحذف ملفات القفل من مجلد data قبل أول تشغيل على السيرفر.

## Raw output

```

--- منطق فحص القفل في src/server.js ---
833:   const lockFile = path.join(store.DATA_DIR, 'bot.lock');
834:   let lockFd = null;
835:   if (fs.existsSync(lockFile)) {
836:     try {
837:       const rawLock = fs.readFileSync(lockFile, 'utf8').trim();
838:       const [oldPid] = rawLock.split('\n');
839:       const pidNum = parseInt(oldPid, 10);
840:       if (pidNum && !isNaN(pidNum) && pidNum !== process.pid) {
841:         try {
842:           process.kill(pidNum, 0); // فحص هل العملية لا زالت قيد التشغيل
843:           console.error('\n[FATAL] نسخة أخرى من البوت قيد التشغيل بالفعل (PID: ' + pidNum + ')!\nيرجى إيقاف النسخة السابقة أولاً قبل تشغيل نسخة جديدة.\n');
844:           process.exit(2);
845:         } catch (_) {
846:           try { fs.unlinkSync(lockFile); } catch (_) {}
847:         }
848:       }
849:     } catch (_) {}
850:   }
851:   try {
852:     lockFd = fs.openSync(lockFile, 'w');
853:     fs.writeSync(lockFd, String(process.pid) + '\n' + new Date().toISOString() + '\n');
854:   } catch (err) {
855:     console.error(`\n[LOCK] تعذر حجز قفل التشغيل: ${err.message}\n`);
856:   }
857: 
858:   const server = app.listen(config.port, config.host, () => {

--- محتوى ملف القفل الحالي ---
المسار: D:\wa-booking-bot\data\bot.lock
المحتوى:
15968
2026-11-11T12:13:11.946Z
PID: 15968   الطابع الزمني: 2026-11-11T12:13:11.946Z

--- هل PID ويندوز مستخدم كـ PID لينكس؟ ---
PID من ملف القفل: 15968
على ويندوز: PID 15968 هو عملية node الخاصة بالبوت.
بعد نقل data/ إلى سيرفر لينكس: لا وجود لـ "node 15968" هناك،
لكن Linux يعيد تدوير أرقام PID — وPID 15968 على السيرفر الجديد
قد يكون حيّاً لعملية أخرى تماماً (nginx، docker، sshd).

--- محاكاة فحص القفل بمنطق server.js نفسه ---
حالة PID حيّ على السيرفر الجديد:  {"blocked":true,"reason":"process.kill(15968, 0) نجح ⇒ البوت يخرج بـ exit(2)"}
حالة PID غير حيّ:                  {"blocked":false,"reason":"process.kill(15968, 0) فشل ⇒ يُحذف القفل ويُكمل"}

--- الأثر مع systemd ---
  WorkingDirectory=/opt/wa-booking-bot
  ExecStart=/usr/bin/node /opt/wa-booking-bot/src/server.js
  Restart=on-failure
مع Restart=always: كل رفض بإ.exit(2) ⇒ إعادة تشغيل فورية ⇒ حلقة إقلاع لا نهائية.
لا سجل أخطاء مفيد: الرسالة "[FATAL] نسخة أخرى قيد التشغيل" مضلِّلة،
لأن النسخة الأخرى قد لا وجود لها أصلاً على هذا السيرفر.

--- ملف قفل المشرف — نفس المشكلة ---
supervisor.lock: 30368
  scripts/supervisor.js:25: const SUPERVISOR_LOCK = path.join(DATA_DIR, 'supervisor.lock');
  scripts/supervisor.js:87: process.kill(pidNum, 0); // فحص هل العملية لا زالت قيد التشغيل
```
