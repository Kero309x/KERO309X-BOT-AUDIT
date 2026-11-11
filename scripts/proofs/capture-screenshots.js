'use strict';

/**
 * التقاط لقطات شاشة للوحة الإدارة.
 *
 * المصدر: بيئة sandbox المدمجة في المشروع (sandbox/) — وهي بيئة اختبار
 * ببيانات اصطناعية بالكامل (3 عملاء، 5 حجوزات، أرقام وهمية).
 * لا تُلتقط أي بيانات عميل حقيقية: لا حاجة لنسخ القاعدة ولا لتنقيتها.
 *
 * إن لم تكن الـsandbox شغالة، يبدأها السكربت تلقائياً عبر sandbox/start.ps1
 * (Windows) أو يشغّلها يدوياً على لينكس.
 *
 * المخرجات: evidence/screenshots/*.png + manifest.json
 */

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const OUT_DIR = process.env.SHOT_DIR || path.join(REPO_ROOT, 'evidence', 'screenshots');
const SANDBOX_ENV = path.join(REPO_ROOT, 'sandbox', 'runtime', '.env.sandbox');

/** يقرأ إعدادات sandbox من ملف .env.sandbox. */
function readSandboxEnv() {
  const out = {};
  const raw = fs.readFileSync(SANDBOX_ENV, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const ENV = readSandboxEnv();
const PORT = Number(process.env.SHOT_PORT || ENV.PORT || 3100);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_USER = ENV.ADMIN_USER || 'sandbox';
const ADMIN_PASS = ENV.ADMIN_PASS || 'sandbox-pass-1234';

const PAGES = [
  { name: 'overview', url: '/admin/', title: 'لوحة التحكم' },
  { name: 'bookings', url: '/admin/bookings', title: 'الحجوزات' },
  { name: 'customers', url: '/admin/customers', title: 'العملاء' },
  { name: 'digitalcore', url: '/admin/digitalcore', title: 'الرقمي' },
  { name: 'coupons', url: '/admin/coupons', title: 'الكوبونات' },
  { name: 'tickets', url: '/admin/tickets', title: 'التذاكر' },
  { name: 'handoffs', url: '/admin/handoffs', title: 'التحويلات' },
  { name: 'owners', url: '/admin/owners', title: 'الأونرات' },
  { name: 'packages', url: '/admin/packages', title: 'الباقات' },
  { name: 'settings', url: '/admin/settings', title: 'الإعدادات' },
  { name: 'store-config', url: '/admin/store-config', title: 'إعدادات المتجر' },
  { name: 'worklist', url: '/admin/worklist', title: 'قائمة العمل' },
  { name: 'funnel', url: '/admin/funnel', title: 'القمع' },
  { name: 'onboarding', url: '/admin/onboarding', title: 'الإعداد' },
  { name: 'login', url: '/admin/login', title: 'تسجيل الدخول', anon: true },
  { name: 'dashboard-spa', url: '/dashboard/', title: 'لوحة البيانات' },
];

async function waitForServer(url, timeoutMs = 60000) {
  const start = Date.now();
  let lastErr = null;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/health`);
      const body = await res.text();
      if (res.ok && body.includes('"ok":true')) return true;
      lastErr = new Error(`status ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 600));
  }
  console.error(`      تعذّر الوصول إلى ${url}: ${lastErr && lastErr.message}`);
  return false;
}

function startSandbox() {
  console.log('      تشغيل sandbox…');
  const ps1 = path.join(REPO_ROOT, 'sandbox', 'start.ps1');
  if (process.platform === 'win32' && fs.existsSync(ps1)) {
    const res = spawnSync('powershell', ['-ExecutionPolicy', 'Bypass', '-File', ps1], {
      cwd: REPO_ROOT, encoding: 'utf8', timeout: 120000,
    });
    console.log((res.stdout || '').slice(-800));
    console.error((res.stderr || '').slice(-400));
    return true;
  }
  return false;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log(`[1/3] التأكد من تشغيل sandbox على ${BASE}…`);
  let up = await waitForServer(BASE, 4000);
  if (!up) {
    if (!startSandbox()) {
      console.error('تعذّر تشغيل sandbox. شغّله يدوياً: powershell -File sandbox/start.ps1');
      process.exit(1);
    }
    up = await waitForServer(BASE, 60000);
  }
  if (!up) {
    console.error('الـsandbox لم يستجب.');
    process.exit(1);
  }
  console.log('       الـsandbox جاهز (بيانات اصطناعية بالكامل)');

  console.log('[2/3] التقاط اللقطات…');
  const { chromium } = require('playwright');
  // chromium المُنزَّل مع Playwright غير مطلوب — نستخدم Edge المثبّت على الجهاز.
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
  } catch (_) {
    browser = await chromium.launch({ headless: true });
  }

  const views = [
    { suffix: 'desktop', viewport: { width: 1440, height: 900 } },
    { suffix: 'mobile', viewport: { width: 390, height: 844 }, mobile: true },
  ];

  const captured = [];
  let failed = 0;
  for (const view of views) {
    const ctx = await browser.newContext({
      viewport: view.viewport,
      isMobile: !!view.mobile,
      hasTouch: !!view.mobile,
      deviceScaleFactor: 1,
      locale: 'ar-EG',
      httpCredentials: { username: ADMIN_USER, password: ADMIN_PASS },
    });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      try {
        const resp = await page.goto(`${BASE}${p.url}`, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await page.waitForTimeout(1000);
        const file = path.join(OUT_DIR, `${p.name}-${view.suffix}.png`);
        await page.screenshot({ path: file, fullPage: false });
        captured.push({ page: p.name, view: view.suffix, status: resp ? resp.status() : null });
        console.log(`       ✓ ${p.name}-${view.suffix}${resp ? ` (${resp.status()})` : ''}`);
      } catch (err) {
        failed += 1;
        console.log(`       ✗ ${p.name}-${view.suffix}: ${err.message.split('\n')[0]}`);
      }
    }
    await ctx.close();
  }
  await browser.close();

  console.log('[3/3] كتابة البيان…');
  const manifest = {
    capturedAt: new Date().toISOString(),
    source: 'sandbox (synthetic data — no real customer data)',
    baseUrl: BASE,
    pages: PAGES.length,
    views: views.map((v) => v.suffix),
    captured: captured.length,
    failed,
    capturedFiles: captured,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`\nتم التقاط ${captured.length} لقطة في ${OUT_DIR}`);
  if (failed) console.log(`فشل: ${failed}`);
}

main().catch((err) => {
  console.error('فشل الالتقاط:', err);
  process.exit(1);
});
