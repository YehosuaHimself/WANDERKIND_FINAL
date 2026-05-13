/**
 * Accessibility audit · Playwright + axe-core
 *
 * Runs axe against the foundation pages. Fails on any violation at
 * 'serious' or 'critical' impact. Reports 'moderate' / 'minor' as
 * warnings.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AXE_CDN_PATH = resolve(__dirname, '../node_modules/axe-core/axe.min.js');
const PAGES = [
  'http://localhost:8080/',
  'http://localhost:8080/system.html',
];

(async () => {
  const axeSource = readFileSync(AXE_CDN_PATH, 'utf8');
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  let totalSerious = 0;

  for (const url of PAGES) {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.addScriptTag({ content: axeSource });
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
        const icon = (v.impact === 'critical' || v.impact === 'serious') ? '✗' : '·';
        console.log(`${icon} [${v.impact}] ${v.id}: ${v.description}`);
        console.log(`    ${v.helpUrl}`);
        for (const n of v.nodes.slice(0, 3)) {
          console.log(`    → ${n.html.slice(0, 120)}`);
        }
        if (v.impact === 'critical' || v.impact === 'serious') totalSerious++;
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
