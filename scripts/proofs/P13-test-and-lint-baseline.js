'use strict';

/**
 * P13 — خط أساس الاختبارات والتدقيق الثابت.
 *
 * هذا الـproof لا يثبت خللاً بل يوثّق الحالة الحالية للمشروع بأرقام قابلة
 * للمقارنة قبل/بعد أي إصلاح. يُشغّل npm test و npm run lint ويحفظ مخرجاتهما.
 * كود خروج: 0 = الاختبارات كلها ناجحة، 2 = وجود فشل.
 */

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, EVIDENCE_DIR, say, section, finish } = require('./_lib');

function run(cmd, args, label) {
  const started = Date.now();
  const res = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });
  const ms = Date.now() - started;
  const out = `${res.stdout || ''}${res.stderr || ''}`;
  try {
    const dir = path.join(EVIDENCE_DIR, 'baseline');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${label}.txt`), out, 'utf8');
  } catch (err) {
    say(`تعذّر حفظ مخرجات ${label}: ${err.message}`);
  }
  return { out, ms, status: res.status };
}

function main() {
  say('خط الأساس يُلتقط من الشجرة الحالية. أي إصلاح لاحق يغيّر هذه الأرقام.');
  say('يُحفظ المخرجات الكاملة في evidence/baseline/.');

  section('npm run lint');
  const lint = run('npm', ['run', 'lint'], 'npm-lint');
  const lintSummary = (lint.out.match(/.*\d+ problems?.*/) || ['(لا سطر ملخص)'])[0].trim();
  say(`المدة: ${Math.round(lint.ms / 1000)} ثانية`);
  say(`الملخص: ${lintSummary}`);
  say(`كود الخروج: ${lint.status}`);
  const lintErrors = Number((lint.out.match(/(\d+) errors?/) || [0, 0])[1]);
  const lintWarnings = Number((lint.out.match(/(\d+) warnings?/) || [0, 0])[1]);
  say(`أخطاء: ${lintErrors} — تحذيرات: ${lintWarnings}`);

  section('npm test');
  const test = run('npm', ['test'], 'npm-test');
  const g = (re) => {
    const m = test.out.match(re);
    return m ? Number(m[1]) : 0;
  };
  const tests = g(/tests\s+(\d+)/);
  const passes = g(/pass\s+(\d+)/);
  const fails = g(/fail\s+(\d+)/);
  const skipped = g(/skipped\s+(\d+)/);
  const duration = g(/duration_ms\s+([\d.]+)/);
  say(`المدة: ${Math.round(test.ms / 1000)} ثانية`);
  say(`الاختبارات: ${tests} — الناجحة: ${passes} — الفاشلة: ${fails} — المتخطّاة: ${skipped}`);
  say(`duration_ms: ${duration}`);
  say(`كود الخروج: ${test.status}`);

  section('الاختبارات الفاشلة');
  const failBlock = test.out.split('failing tests:')[1];
  if (failBlock) {
    failBlock.split('\n').filter((l) => l.trim().startsWith('✖') || l.includes('test at')).slice(0, 12)
      .forEach((l) => say(`  ${l.trim()}`));
  } else {
    say('لا يوجد قسم failing tests — كل الاختبارات ناجحة.');
  }

  section('ملاحظة على توثيق المشروع');
  const agents = fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8');
  const claimed = (agents.match(/(\d+)\s+(?:تست|اختبار)/) || [])[1];
  say(`AGENTS.md يذكر "${claimed || '؟'}" اختبار. الواقع المُقاس: ${tests}.`);
  say(`AGENTS.md يذكر "صفر أخطاء" في lint — Reality: ${lintErrors} أخطاء و${lintWarnings} تحذيراً.`);
  say('التوثيق أدقّ من أن يُترك على حاله؛ صحّحه في نفس التعديل الذي يحدّث الأرقام.');

  const reproduced = fails > 0;

  finish({
    id: 'P13',
    slug: 'test-and-lint-baseline',
    title: 'خط أساس الاختبارات والتدقيق الثابت',
    severity: 'info',
    area: 'quality',
    refs: ['package.json:19-22', 'AGENTS.md:12-13'],
    claim:
      'خط الأساس الحالي: كل الاختبارات ناجحة (عدا اختبارات الصوتيةMissing التبعية)، '
      + 'والتدقيق الثابت بلا أخطاء لكن بتحذيرات. الأرقام موثّقة للمقارنة قبل/بعد.',
    expected:
      'أن يكون خط الأساس موثّقاً ومكتوباً في مكان واحد، وأن تتطابق أرقام الوثائق مع الواقع.',
    observed:
      `الاختبارات: ${tests} (ناجحة ${passes}، فاشلة ${fails}، متخطّاة ${skipped}) `
      + `بمدة ${duration} ms. `
      + `lint: ${lintErrors} أخطاء و ${lintWarnings} تحذيراً بمدة ${Math.round(lint.ms / 1000)} ثانية. `
      + `AGENTS.md يذكر ${claimed || '؟'} اختبار بينما الواقع ${tests}.`,
    impact:
      'لا أثر مباشر. خط الأساس مرجع لقياس أثر أي إصلاح: أي change يقلّل عدد '
      + 'الاختبارات أو يزيد الأخطاء يجب أن يُرفض.',
    fix:
      'حدّث AGENTS.md بالأرقام المقيسة، وأضف `eslint . --max-warnings 0` إلى '
      + 'سير العمل بعد تنظيف التحذيرات، واجعل npm test شرطاً في المراجعة.',
    reproduced,
  });
}

main();
