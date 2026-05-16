// scripts/screenshots.mjs · Wanderkind visual + Lighthouse harness
//
// This is permanent infrastructure. Every commit + every day at 06:00 UTC,
// this runs against the deployed app and produces:
//   1. Full-page screenshots at iPhone-14-Pro viewport (15+ pages)
//   2. Lighthouse scores per page (perf · a11y · best-practices · SEO)
//   3. Console errors + page errors per page
//   4. A markdown report cross-referencing all of the above
//   5. JSON report for machine consumption
//
// Output goes to wk-shots/ and uploads as a workflow artifact.

import { chromium } from 'playwright';
import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'https://wanderkind.love';
const OUT = process.env.OUT_DIR || 'wk-shots';

// iPhone 14 Pro logical viewport
const VIEWPORT = { width: 393, height: 852 };
const DEVICE_SCALE = 2;

// Pages we screenshot AND audit. Each row: [path, slug, lighthouse?]
// `lighthouse` flag: true = run Lighthouse on this page. false = just screenshot
// (auth-gated pages won't render anything useful for Lighthouse without a session).
const PAGES = [
  ['/',                    'home',                  true],
  ['/install.html',        'install',               true],
  ['/about.html',          'about',                 true],
  ['/system.html',         'system',                true],
  ['/onboarding/',         'onboarding-step1',      true],
  ['/onboarding/?step=2',  'onboarding-step2-signup', false],
  ['/onboarding/?step=5',  'onboarding-step5-doctrine', false],
  ['/way.html',            'way',                   true],
  ['/walks.html',          'walks',                 true],
  ['/map.html',            'map',                   false],  // skip LH on map (Leaflet timing varies)
  ['/auth.html',           'auth',                  true],
  ['/me.html',             'me-signed-out',         false],
  ['/more.html',           'more-signed-out',       false],
  ['/id.html',             'id-signed-out',         false],
  ['/passes.html',         'passes-signed-out',     false],
  ['/stamps.html',         'stamps-signed-out',     false],
  ['/host.html',           'host-signed-out',       false],
  ['/hosts.html',          'hosts-signed-out',      false],
  ['/messages.html',       'messages-signed-out',   false],
  ['/verify-me.html',      'verify-me-signed-out',  false],
  ['/settings.html',       'settings-signed-out',   false],
];

fs.mkdirSync(OUT, { recursive: true });

// ── 1. Screenshots + console capture ────────────────────────────────────
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: DEVICE_SCALE,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  hasTouch: true,
  isMobile: true,
});

const report = [];
for (const [pagePath, name, wantLH] of PAGES) {
  const page = await ctx.newPage();
  const consoleMsgs = [];
  const pageErrors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') consoleMsgs.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));

  const url = BASE + pagePath;
  let status = 0;
  const t0 = Date.now();
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  } catch (err) {
    pageErrors.push('NAVIGATION_FAILED: ' + String(err));
  }
  const timing = Date.now() - t0;

  report.push({
    name, path: pagePath, url, status, timing_ms: timing,
    console_warnings: consoleMsgs,
    page_errors: pageErrors,
    lighthouse: null, // filled below
    want_lighthouse: wantLH,
  });
  console.log(`${status >= 200 && status < 400 ? '✓' : '✗'} ${name.padEnd(28)} ${status} · ${timing}ms · ${consoleMsgs.length}w · ${pageErrors.length}e`);
  await page.close();
}
await browser.close();

// ── 2. Lighthouse per page (only for non-auth pages) ────────────────────
console.log('\n── Running Lighthouse on public pages ──');
for (const row of report) {
  if (!row.want_lighthouse) continue;
  const outFile = path.join(OUT, `${row.name}.lh.json`);
  try {
    const res = spawnSync('npx', [
      'lighthouse', row.url,
      '--output=json', `--output-path=${outFile}`,
      '--quiet',
      '--chrome-flags=--headless=new --no-sandbox --disable-gpu',
      '--preset=desktop',
    ], { encoding: 'utf-8', stdio: ['ignore', 'ignore', 'pipe'] });
    if (res.status !== 0) {
      row.lighthouse = { error: `lighthouse exited ${res.status}` };
      console.log(`  ✗ ${row.name}: failed to audit`);
      continue;
    }
    const j = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
    const cats = j.categories || {};
    row.lighthouse = {
      performance: Math.round((cats.performance?.score || 0) * 100),
      accessibility: Math.round((cats.accessibility?.score || 0) * 100),
      'best-practices': Math.round((cats['best-practices']?.score || 0) * 100),
      seo: Math.round((cats.seo?.score || 0) * 100),
    };
    const lh = row.lighthouse;
    console.log(`  · ${row.name.padEnd(28)} P:${lh.performance} A:${lh.accessibility} B:${lh['best-practices']} S:${lh.seo}`);
  } catch (err) {
    row.lighthouse = { error: String(err) };
    console.log(`  ✗ ${row.name}: ${err}`);
  }
}

// ── 3. Reports ───────────────────────────────────────────────────────────
fs.writeFileSync(`${OUT}/_report.json`, JSON.stringify(report, null, 2));

const md = [
  `# Wanderkind · Visual + Lighthouse run`,
  ``,
  `Generated: ${new Date().toISOString()}`,
  `Base URL: \`${BASE}\``,
  `Viewport: ${VIEWPORT.width}×${VIEWPORT.height} @ ${DEVICE_SCALE}× · iPhone-14-Pro UA`,
  ``,
  `## Doctrine`,
  `Lighthouse 100 / 100 / 100 / 100 (perf · a11y · best-practices · SEO). The CI gate enforces 95+ on perf and best-practices (transition) and 100 on a11y + SEO.`,
  ``,
  `## Summary`,
  ``,
  `| Page | HTTP | ms | Warns | Errors | Perf | A11y | BP | SEO |`,
  `|---|---|---|---|---|---|---|---|---|`,
  ...report.map((r) => {
    const lh = r.lighthouse || {};
    const score = (k) => lh.error ? '—' : (lh[k] != null ? (lh[k] === 100 ? `**${lh[k]}**` : String(lh[k])) : '—');
    return `| \`${r.name}\` | ${r.status} | ${r.timing_ms} | ${r.console_warnings.length} | ${r.page_errors.length} | ${score('performance')} | ${score('accessibility')} | ${score('best-practices')} | ${score('seo')} |`;
  }),
  ``,
];

const issues = report.filter((r) => r.console_warnings.length || r.page_errors.length);
if (issues.length) {
  md.push(`## Console + page errors`, ``);
  for (const r of issues) {
    md.push(`### ${r.name}`);
    if (r.page_errors.length)      { md.push(`**Page errors:**`); r.page_errors.forEach((e) => md.push(`- \`${e}\``)); md.push(``); }
    if (r.console_warnings.length) { md.push(`**Console:**`);     r.console_warnings.forEach((e) => md.push(`- \`${e}\``)); md.push(``); }
  }
}

const below100 = report.filter((r) => r.lighthouse && !r.lighthouse.error &&
  (r.lighthouse.accessibility < 100 || r.lighthouse.seo < 100));
if (below100.length) {
  md.push(`## Pages below 100 on canon-mandatory categories`, ``);
  for (const r of below100) {
    md.push(`- \`${r.name}\` — a11y ${r.lighthouse.accessibility}, seo ${r.lighthouse.seo}`);
  }
}

fs.writeFileSync(`${OUT}/_report.md`, md.join('\n'));
console.log(`\n✓ Wrote ${report.length} screenshots + ${report.filter(r=>r.lighthouse).length} Lighthouse audits to ${OUT}/`);
console.log(`   Report: ${OUT}/_report.md`);
