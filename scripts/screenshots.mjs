// scripts/screenshots.mjs · Wanderkind visual testing harness
//
// Runs in CI (GitHub Actions). Visits every key page of the deployed
// app at iPhone-14-Pro viewport, takes a full-page screenshot, captures
// console errors + page errors. Output uploads as a workflow artifact.
//
// To trigger manually:
//   GitHub → Actions → "Screenshots" workflow → Run workflow.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE_URL || 'https://wanderkind.love';
const OUT = process.env.OUT_DIR || 'wk-shots';

// iPhone 14 Pro logical viewport
const VIEWPORT = { width: 393, height: 852 };
const DEVICE_SCALE = 2;

const PAGES = [
  // Public (no auth)
  ['/',                'home'],
  ['/install.html',    'install'],
  ['/onboarding/',     'onboarding-step1'],
  ['/onboarding/?step=2', 'onboarding-step2-signup'],
  ['/onboarding/?step=5', 'onboarding-step5-doctrine'],
  ['/about.html',      'about'],
  ['/system.html',     'system'],
  ['/way.html',        'way'],
  ['/walks.html',      'walks'],

  // Map (public; tiles + landmarks + WanderWall handle)
  ['/map.html',        'map'],

  // Signed-out states of gated pages — useful to see the auth gate
  ['/me.html',         'me-signed-out'],
  ['/more.html',       'more-signed-out'],
  ['/id.html',         'id-signed-out'],
  ['/passes.html',     'passes-signed-out'],
  ['/stamps.html',     'stamps-signed-out'],
  ['/host.html',       'host-signed-out'],
  ['/hosts.html',      'hosts-signed-out'],
  ['/messages.html',   'messages-signed-out'],
  ['/verify-me.html',  'verify-me-signed-out'],
  ['/auth.html',       'auth'],
];

fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: DEVICE_SCALE,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
});

const report = [];
for (const [path, name] of PAGES) {
  const page = await ctx.newPage();
  const consoleMsgs = [];
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(String(e)));

  const url = BASE + path;
  let status = 0;
  let timing = 0;
  const t0 = Date.now();
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    status = resp ? resp.status() : 0;
    // small settle for animations
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  } catch (err) {
    errors.push('NAVIGATION_FAILED: ' + String(err));
  }
  timing = Date.now() - t0;

  report.push({
    name, path, url, status, timing_ms: timing,
    console_warnings: consoleMsgs,
    page_errors: errors,
  });
  console.log(`${status >= 200 && status < 400 ? '✓' : '✗'} ${name.padEnd(28)} ${status} · ${timing}ms · ${consoleMsgs.length}w · ${errors.length}e`);
  await page.close();
}

fs.writeFileSync(`${OUT}/_report.json`, JSON.stringify(report, null, 2));

// Markdown summary for easy reading
const md = [
  `# Wanderkind · Screenshot run · ${new Date().toISOString()}`,
  ``,
  `Base URL: \`${BASE}\``,
  `Viewport: ${VIEWPORT.width}×${VIEWPORT.height} @ ${DEVICE_SCALE}× · iPhone-14-Pro UA`,
  ``,
  `## Summary`,
  ``,
  `| Page | Status | Timing | Warnings | Errors |`,
  `|---|---|---|---|---|`,
  ...report.map((r) => `| \`${r.name}\` | ${r.status} | ${r.timing_ms}ms | ${r.console_warnings.length} | ${r.page_errors.length} |`),
  ``,
];
for (const r of report) {
  if (r.console_warnings.length || r.page_errors.length) {
    md.push(``, `### ${r.name}`);
    if (r.page_errors.length)       { md.push(``, `**Page errors:**`); r.page_errors.forEach((e) => md.push(`- \`${e}\``)); }
    if (r.console_warnings.length)  { md.push(``, `**Console:**`); r.console_warnings.forEach((e) => md.push(`- \`${e}\``)); }
  }
}
fs.writeFileSync(`${OUT}/_report.md`, md.join('\n'));

await browser.close();
console.log(`\n✓ Wrote ${report.length} screenshots to ${OUT}/`);
