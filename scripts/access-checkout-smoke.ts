import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { PLANS, PURCHASE_HELP, type PlanId } from '../webapp/src/lib/site';

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors: string[] = [], writes: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.method() === 'POST' && new URL(request.url()).pathname.startsWith('/api/')) writes.push(request.url()); });
  try {
    await page.goto(process.env.CHECKOUT_URL || 'http://127.0.0.1:3137/get-access');
    for (const id of Object.keys(PLANS) as PlanId[]) {
      if (id === 'lifetime') await page.setViewportSize({ width: 390, height: 844 });
      await page.getByRole('button', { name: `Choose ${PLANS[id].name}`, exact: true }).click();
      await page.getByLabel('Full name', { exact: true }).fill('Checkout test');
      await page.getByLabel('Email address', { exact: true }).fill('checkout@example.test');
      await page.getByRole('button', { name: 'Continue to payment review', exact: true }).click();
      const summary = page.getByRole('complementary', { name: 'Order summary' });
      assert.match(await summary.innerText(), new RegExp(`Novi ${PLANS[id].name}`));
      assert((await summary.innerText()).includes(PLANS[id].price));
      await page.getByRole('button', { name: 'Continue to checkout', exact: true }).click();
      await page.getByRole('status').filter({ hasText: PURCHASE_HELP }).waitFor();
      assert.equal(await page.locator('input').count(), 0, 'the final step collects no payment details');
      const contact = await page.getByRole('link', { name: 'Contact the developer', exact: true }).getAttribute('href');
      assert(contact?.startsWith('mailto:'));
      assert(decodeURIComponent(contact!).includes(`Plan: ${PLANS[id].name}`));
      await page.getByRole('button', { name: 'Back to payment review', exact: true }).click();
      await page.getByRole('button', { name: 'Edit your details', exact: false }).click();
      assert.equal(await page.getByLabel('Email address', { exact: true }).inputValue(), 'checkout@example.test');
    }
    assert.deepEqual(writes, [], 'the preview never charges a payment or issues a license');
    assert.deepEqual(errors, []);
    console.log('Purchase preview passed for all four plans, including mobile layout and developer-help handoff.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
