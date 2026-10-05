import assert from 'node:assert/strict';
import { chromium } from 'playwright';

// Run against a local webapp; all account and provider requests are mocked.
async function main() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    let admin = true, generation = 1, fail = false;
    let saved: Record<string, string> | undefined;
    await page.route('**/api/control/state', route => route.fulfill({ json: { data: {
      user: { id: admin ? 'admin' : 'owner', role: admin ? 'ADMIN' : 'STANDALONE', username: 'test', name: 'Test' },
      accounts: [{ id: 'owner', name: 'Owner', username: 'owner', role: 'STANDALONE', status: 'ACTIVE' }], licenses: [], sessions: [], requests: [],
      credentials: [{ id: 'key', ownerId: 'owner', nickname: 'Google key', provider: 'GEMINI', model: '', lastFour: 'TEST' }],
      providers: { GEMINI: { name: 'Google Gemini' }, OPENAI: { name: 'OpenAI' } },
    } } }));
    await page.route('**/api/control/credentials/key/models', route => fail
      ? route.fulfill({ status: 502, json: { error: 'Provider unavailable' } })
      : route.fulfill({ json: { data: { models: Array.from({ length: generation }, (_, n) => ({ id: `gemini-${n}`, name: `Gemini ${n}` })), checkedAt: new Date().toISOString() } } }));
    await page.route('**/api/control/credentials', route => { saved = route.request().postDataJSON(); return route.fulfill({ json: { data: {} } }); });
    await page.goto(process.env.MANAGEMENT_URL || 'http://localhost:3105');
    await page.getByRole('button', { name: 'API management', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Add API key', exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Check models', exact: true }).click();
    await page.getByRole('option', { name: 'Gemini 0 (gemini-0)', exact: true }).waitFor({ state: 'attached' });
    generation = 2;
    await page.getByRole('button', { name: 'Check models', exact: true }).click();
    await page.getByText(/1 newly available since the last check/).waitFor();
    assert.equal(await page.getByLabel('Available models', { exact: true }).getByRole('option').count(), 3);
    fail = true;
    await page.getByRole('button', { name: 'Check models', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Provider unavailable' }).waitFor();
    assert.equal(await page.getByLabel('Available models', { exact: true }).getByRole('option').count(), 3);
    admin = false;
    await page.reload();
    await page.getByRole('button', { name: 'API management', exact: true }).click();
    await page.getByRole('button', { name: 'Add API key', exact: true }).click();
    assert.equal(await page.getByLabel('Model ID', { exact: true }).count(), 0);
    await page.getByLabel('Nickname', { exact: true }).fill('New key');
    await page.getByRole('dialog').locator('input[type="password"]').fill('fixture-not-a-real-key');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'detached' });
    assert(saved && !('model' in saved));
    console.log('Admin model UI passed: check models, newly available models, refresh failure, key-only setup.');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
