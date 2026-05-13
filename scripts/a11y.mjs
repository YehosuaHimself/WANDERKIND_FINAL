/**
 * Accessibility audit · Playwright + axe-core
 *
 * Runs axe against the foundation pages. Fails on any violation at
 * 'serious' or 'critical' impact. Reports 'moderate' / 'minor' as
 * warnings. Uses setBypassCSP so the strict production CSP can stay
 * locked (no 'unsafe-inline', no 'unsafe-eval') and still be testable.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXE_PATH = resolve(__dirname, '../node_modules/axe-core/axe.min.js');
const PAGES = [
  'http://localhost:8080/',
  'http://localhost:8080/system.html',
  'http://localhost:8080/map.html',
  'http://localhost:8080/auth.html',
  'http://localhost:8080/me.html',
  'http://localhost:8080/more.html',
];

(async () => {
  const axeSource = readFileSync(AXE_PATH, 'utf8');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ bypassCSP: true });
  let totalSerious = 0;

  for (const url of PAGES) {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    // Inject axe via evaluate (works regardless of CSP since CDP isn't subject to it)
    await page.evaluate(axeSource);
    /** @type {{violations: Array<{id:string,impact:string,description:string,helpUrl:string,nodes:Array<any>}>}} */
    const result = await page.evaluate(async () => {
      // @ts-ignore — axe is injected
      return await axe.run(document, { resultTypes: ['violations'] });
    });

    console.log(`\n=== ${url} ===`);
    if (result.violations.length === 0) {
      console.log('✓ No violations');
    } else {
      for (const v of result.violations) {
        const serious = v.impact === 'critical' || v.impact === 'serious';
        console.log(`${serious ? '✗' : '·'} [${v.impact}] ${v.id}: ${v.description}`);
        console.log(`    ${v.helpUrl}`);
        for (const n of v.nodes.slice(0, 3)) {
          console.log(`    → ${String(n.html).slice(0, 140)}`);
          if (n.failureSummary) console.log(`      ${n.failureSummary.split('\n')[0]}`);
        }
        if (serious) totalSerious++;
      }
    }
    await page.close();
  }

  await browser.close();
  if (totalSerious > 0) {
    console.error(`\n✗ ${totalSerious} serious/critical violation(s). CI failed.`);
    process.exit(1);
  }
  console.log('\n✓ Accessibility audit passed (no serious/critical violations).');
})();
