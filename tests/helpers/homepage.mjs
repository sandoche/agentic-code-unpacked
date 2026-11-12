import assert from 'node:assert/strict';

export async function checkHomepage(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.goto(url);
    await page.waitForSelector('.demo-explorer.is-enhanced');
    assert.equal(await page.locator('h1').count(), 1);
    assert.match(await page.title(), /Code Unpacked/);
    const primary = await page.locator('.hero .primary').boundingBox();
    assert.ok(primary && primary.y + primary.height <= 800, 'installation action is above the desktop fold');
    assert.equal(await page.getByRole('link', { name: /showcase/i }).count(), 0);

    const walkthrough = page.locator('#demo-walkthrough');
    await walkthrough.getByRole('button', { name: 'Next step', exact: true }).click();
    assert.equal(await walkthrough.getByRole('heading', { name: 'Save both records together' }).isVisible(), true);
    await walkthrough.getByRole('button', { name: 'Next step', exact: true }).click();
    assert.equal(await walkthrough.getByRole('heading', { name: 'Handle another delivery' }).isVisible(), true);
    assert.equal(await walkthrough.getByRole('button', { name: 'Next step', exact: true }).isDisabled(), true);

    await page.getByRole('tab', { name: 'Reverse design', exact: true }).click();
    await page.getByRole('tab', { name: 'Rollback', exact: true }).click();
    assert.equal(await page.getByText('Allow a later retry', { exact: true }).isVisible(), true);
    await page.getByRole('tab', { name: 'Code map', exact: true }).click();
    await page.getByRole('tab', { name: 'saveOrderAndEvent', exact: true }).click();
    assert.equal(await page.getByText('Writes the order and unique event marker atomically.', { exact: true }).isVisible(), true);

    await page.getByRole('tab', { name: 'Review quiz', exact: true }).click();
    const quiz = page.locator('[data-quiz]');
    assert.equal(await page.getByText('The completed architecture', { exact: true }).isVisible(), false);
    await quiz.getByRole('button', { name: 'Check my answers' }).click();
    assert.match(await quiz.locator('[data-quiz-status]').textContent(), /Choose an answer/);
    await quiz.locator('input[name="race"][value="read"]').check();
    await quiz.locator('input[name="architecture"][value="same"]').check();
    await quiz.getByRole('button', { name: 'Check my answers' }).click();
    assert.match(await quiz.locator('[data-quiz-status]').textContent(), /1\/2/);
    assert.equal(await page.getByText('The completed architecture', { exact: true }).isVisible(), true);
    assert.equal(await quiz.locator('input:disabled').count(), 6);
    await quiz.getByRole('button', { name: 'Retake quiz' }).click();
    assert.equal(await quiz.locator('input:checked').count(), 0);
    assert.equal(await quiz.locator('input:disabled').count(), 0);
    assert.equal(await page.getByText('The completed architecture', { exact: true }).isVisible(), false);
    await quiz.locator('input[name="race"][value="unique"]').check();
    await quiz.locator('input[name="architecture"][value="same"]').check();
    await quiz.getByRole('button', { name: 'Check my answers' }).click();
    assert.match(await quiz.locator('[data-quiz-status]').textContent(), /2\/2/);

    await page.getByRole('tab', { name: 'Comics', exact: true }).click();
    const comic = page.locator('[data-comic]');
    await page.waitForFunction(() => document.querySelector('[data-comic-strip]')?.complete);
    assert.ok(await comic.locator('img').evaluate(image => image.naturalWidth > 0));
    await comic.locator('[data-next]').click();
    assert.equal(await comic.locator('[data-comic-title]').textContent(), 'The race');
    await comic.locator('[data-next]').click();
    assert.equal(await comic.locator('[data-next]').isDisabled(), true);
    await comic.getByText('Read the transcript', { exact: true }).click();
    assert.match(await comic.locator('.comic-transcript').innerText(), /order 17/);

    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: url });
    const install = page.locator('#install [data-copy-root]').first();
    await install.getByRole('button', { name: 'Copy command' }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'npx skills add sandoche/agentic-code-unpacked');
    assert.equal(await install.locator('[role=status]').textContent(), 'Copied');
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('denied'); } } }));
    const usage = page.locator('#install [data-copy-root]').nth(1);
    await usage.getByRole('button', { name: 'Copy command' }).click();
    assert.match(await usage.locator('[role=status]').textContent(), /copy it manually/);
    assert.equal(await page.evaluate(() => window.getSelection()?.toString()), '/walkthrough pr https://github.com/owner/repo/pull/123 --draft');

    const cloud = page.locator('.faq-list details').filter({ has: page.getByText('Does it need a cloud service?', { exact: true }) });
    await cloud.locator('summary').click();
    assert.match(await cloud.locator('p').innerText(), /First use downloads rendering tools/);
    for (const width of [320, 375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => window.scrollTo(0, 0));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `no body overflow at ${width}px`);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    const menu = page.locator('.mobile-nav');
    await menu.locator('summary').click();
    await menu.getByRole('link', { name: 'FAQ', exact: true }).click();
    assert.equal(await menu.getAttribute('open'), null);
    await page.getByRole('tab', { name: 'Walkthrough', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.getByRole('tab', { name: 'Reverse design', exact: true }).getAttribute('aria-selected'), 'true');
    assert.deepEqual(errors, []);
  } finally { await context.close(); }

  const noScript = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  try {
    const page = await noScript.newPage();
    await page.goto(url);
    assert.equal(await page.locator('.demo-panel').count(), 5);
    for (const panel of await page.locator('.demo-panel').all()) assert.equal(await panel.isVisible(), true);
    await page.locator('.quiz-explanation').first().locator('summary').click();
    assert.match(await page.locator('.quiz-explanation').first().innerText(), /unique provider/);
    assert.equal(await page.locator('#install [data-copy-text]').first().textContent(), 'npx skills add sandoche/agentic-code-unpacked');
  } finally { await noScript.close(); }
  return { demos: 5, quiz: 'mixed, correct, and retake passed', widths: [320, 375, 768, 1280, 1920], noScript: true };
}
