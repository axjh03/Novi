// Run against a local webapp: npx tsx scripts/management-smoke.ts
// API responses are intercepted; this never changes real accounts or licenses.
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const accounts = [
    { id: 'admin', name: 'Administrator', username: 'admin', role: 'ADMIN', status: 'ACTIVE' },
    { id: 'a', name: 'Acme Studio', username: 'acme', role: 'STANDALONE', status: 'ACTIVE' },
    { id: 'b', name: 'Beacon Team', username: 'beacon', role: 'SUBCORP', status: 'ACTIVE' },
    ...Array.from({ length: 47 }, (_, i) => ({ id: `account-${i}`, name: `Designer ${i}`, username: `designer.${i}`, role: 'LICENSE', status: 'ACTIVE', parentId: i < 25 ? 'a' : 'b' })),
  ];
  // Plans rotate Core, Pro, Ultimate, Lifetime; Lifetime licenses carry the far-future expiry the server stores.
  const plans = ['CORE', 'PRO', 'ULTIMATE', 'LIFETIME'];
  const licenses = Array.from({ length: 47 }, (_, i) => ({ id: `license-${i}`, key: `TEST-${String(i).padStart(4, '0')}-ABCD-EFGH`, ownerId: i < 25 ? 'a' : 'b', accountId: i % 2 ? `account-${i}` : null, status: i % 7 === 0 ? 'TERMINATED' : 'ACTIVE', plan: plans[i % 4], expiresAt: i % 4 === 3 ? '9999-12-31T00:00:00.000Z' : new Date(Date.now() + (i - 5) * 86400000).toISOString(), createdAt: new Date(Date.UTC(2026, 0, i + 1)).toISOString() }));
  let admin = true;
  let activityQuery = new URLSearchParams();
  let failActivity = false;
  await page.route('**/api/control/state', route => route.fulfill({ json: { data: { user: admin ? accounts[0] : accounts[1], accounts, licenses, sessions: [], credentials: [], requests: [], providers: {} } } }));
  await page.route('**/api/control/activity?*', route => {
    activityQuery = new URL(route.request().url()).searchParams;
    if (failActivity) return route.fulfill({ status: 500, json: { error: 'Test connection error' } });
    const current = Number(activityQuery.get('page')) || 1;
    const total = activityQuery.get('event') ? 1 : 45;
    return route.fulfill({ json: { data: { total, page: current, pages: Math.ceil(total / 20), pageSize: 20, items: Array.from({ length: Math.min(20, total - (current - 1) * 20) }, (_, i) => ({ id: `event-${current}-${i}`, action: activityQuery.get('event') || 'ACCOUNT_UPDATED', actorId: 'admin', actorName: '@admin', targetId: `account-${i}`, targetName: `@designer.${i}`, createdAt: '2026-10-01T14:30:00Z' })) } } });
  });
  try {
    await page.goto(process.env.MANAGEMENT_URL || 'http://localhost:3000');
    await page.getByRole('button', { name: 'Licenses', exact: true }).click();
    await page.getByText('1–20 of 47', { exact: true }).waitFor();
    assert.equal(await page.locator('.license-row').count(), 20);
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await page.getByText('21–40 of 47', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await page.getByText('41–47 of 47', { exact: true }).waitFor();
    assert.equal(await page.locator('.license-row').count(), 7);
    assert.ok(await page.getByRole('button', { name: 'Next page', exact: true }).isDisabled());
    // Owner, account, plan, status and sorting live in the collapsed "Filters & sorting" section.
    await page.locator('.license-filter-details > summary').click();
    await page.getByLabel('Owner', { exact: true }).selectOption('a');
    await page.getByText('1–20 of 25', { exact: true }).waitFor();
    await page.getByLabel('Assigned account', { exact: true }).selectOption('account-1');
    await page.getByText('1–1 of 1', { exact: true }).waitFor();
    assert.ok((await page.locator('.license-row').innerText()).includes('designer.1'));
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.getByRole('button', { name: 'Unassigned 24', exact: true }).click();
    assert.ok(await page.getByLabel('Assigned account', { exact: true }).isDisabled());
    await page.getByLabel('Status', { exact: true }).selectOption('expired');
    assert.equal(await page.locator('.license-row').count(), 2);
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.getByLabel('Search licenses').fill('  DESIGNER.13  ');
    assert.equal(await page.locator('.license-row').count(), 1);
    await page.getByLabel('Search licenses').fill('no-such-key');
    await page.getByRole('heading', { name: 'No matching licenses' }).waitFor();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).first().click();
    await page.getByLabel('Sort by').selectOption('newest');
    assert.ok((await page.locator('.license-row').first().innerText()).includes('TEST-0046'));
    await page.getByLabel('Sort by').selectOption('oldest');
    assert.ok((await page.locator('.license-row').first().innerText()).includes('TEST-0000'));
    await page.getByLabel('Rows per page').selectOption('50');
    assert.equal(await page.locator('.license-row').count(), 47);
    assert.equal(await page.getByRole('button', { name: 'Renew TEST-0000-ABCD-EFGH' }).count(), 0);
    await page.getByRole('button', { name: 'Renew TEST-0001-ABCD-EFGH' }).click();
    await page.getByRole('dialog').waitFor();
    assert.ok((await page.getByRole('dialog').innerText()).includes('TEST-0001'));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Terminate TEST-0001-ABCD-EFGH' }).click();
    assert.ok((await page.getByRole('dialog').innerText()).includes('TEST-0001'));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    // Plans: filter, Lifetime rows, and the Change plan dialog (cancelled; nothing is submitted).
    await page.getByLabel('Plan', { exact: true }).selectOption('LIFETIME');
    await page.getByText('1–11 of 11', { exact: true }).waitFor();
    assert.ok((await page.locator('.license-row').first().innerText()).includes('Never'));
    assert.equal(await page.getByRole('button', { name: 'Renew TEST-0003-ABCD-EFGH' }).count(), 0, 'Lifetime licenses are not renewed');
    await page.getByRole('button', { name: 'Change plan of TEST-0003-ABCD-EFGH' }).click();
    const dialog = page.getByRole('dialog');
    // The current plan can't be chosen again. (Playwright's isDisabled() doesn't read <option>, so ask the element.)
    assert.ok(await dialog.locator('option[value="LIFETIME"]').evaluate(option => (option as HTMLOptionElement).disabled && option.textContent === 'Lifetime (current plan)'));
    assert.equal(await dialog.getByLabel('Duration').count(), 0);
    await dialog.getByLabel(/^Plan/).selectOption('PRO');
    await dialog.getByLabel('Duration').waitFor();
    assert.ok((await dialog.innerText()).includes('Leaving Lifetime starts a new term from today.'));
    await page.screenshot({ path: '.test-data/licenses-change-plan.png' });
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.getByRole('button', { name: 'Change plan of TEST-0001-ABCD-EFGH' }).click();
    await page.getByRole('dialog').getByLabel(/^Plan/).selectOption('ULTIMATE');
    assert.equal(await page.getByRole('dialog').getByLabel('Duration').count(), 0, 'between monthly plans the expiry stays');
    assert.ok((await page.getByRole('dialog').innerText()).includes('The expiry date stays the same.'));
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Issue license', exact: true }).click();
    await page.getByRole('dialog').getByLabel(/^Plan/).selectOption('LIFETIME');
    assert.equal(await page.getByRole('dialog').getByLabel('Duration').count(), 0, 'Lifetime takes no term');
    await page.getByRole('dialog').getByLabel(/^Plan/).selectOption('CORE');
    await page.getByRole('dialog').getByLabel('Duration').waitFor();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByLabel('Sort by').selectOption('owner');
    await page.getByLabel('Rows per page').selectOption('20');
    await mkdir('.test-data', { recursive: true });
    await page.screenshot({ path: '.test-data/licenses-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '.test-data/licenses-mobile.png', fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.getByRole('button', { name: 'Activity', exact: true }).click();
    await page.getByText('1–20 of 45', { exact: true }).waitFor();
    assert.equal(await page.locator('.activity-table tbody tr').count(), 20);
    assert.equal(await page.getByRole('option', { name: /signed in/i }).count(), 0);
    await page.getByRole('button', { name: 'Next page', exact: true }).click();
    await page.getByText('21–40 of 45', { exact: true }).waitFor();
    await page.getByLabel('Sort by').selectOption('asc');
    await page.getByText('1–20 of 45', { exact: true }).waitFor();
    assert.equal(activityQuery.get('sort'), 'asc');
    await page.getByLabel('From', { exact: true }).fill('2026-10-01T09:30');
    await page.getByLabel('Through', { exact: true }).fill('2026-10-01T10:45');
    await page.getByRole('button', { name: 'Apply dates' }).click();
    await page.getByText('1–20 of 45', { exact: true }).waitFor();
    assert.equal(activityQuery.get('from'), await page.evaluate(() => new Date('2026-10-01T09:30').toISOString()));
    assert.equal(activityQuery.get('to'), await page.evaluate(() => new Date(+new Date('2026-10-01T10:45') + 59999).toISOString()));
    await page.getByLabel('Event type').selectOption('LICENSE_RENEWED');
    await page.getByText('1–1 of 1', { exact: true }).waitFor();
    assert.equal(activityQuery.get('event'), 'LICENSE_RENEWED');
    await page.getByLabel('Through', { exact: true }).fill('2026-09-01T10:45');
    assert.ok(await page.getByRole('button', { name: 'Apply dates' }).isDisabled());
    await page.getByRole('button', { name: 'Clear filters', exact: true }).click();
    await page.getByText('1–20 of 45', { exact: true }).waitFor();
    await page.screenshot({ path: '.test-data/activity-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: '.test-data/activity-mobile.png', fullPage: true });
    failActivity = true;
    await page.getByLabel('Sort by').selectOption('desc');
    await page.getByRole('heading', { name: 'Activity could not be loaded' }).waitFor();
    failActivity = false;
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByText('1–20 of 45', { exact: true }).waitFor();
    admin = false;
    await page.reload();
    await page.getByRole('button', { name: 'Licenses', exact: true }).click();
    await page.getByText('1–20 of 47', { exact: true }).waitFor();
    assert.equal(await page.getByRole('columnheader', { name: 'Manage', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Activity', exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log('License and activity UI checks passed (desktop, mobile, filtering, sorting, pagination, dialogs, errors, and role visibility).');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
