// Explicit classification is required: prepared crops never choose their own destination.
async function classifyAll(dialog, kind = 'image', placement = 'separate') {
  await dialog.waitFor();
  const choices = dialog.locator(`[data-classify-reference][data-conversion-kind="${kind}"]`);
  while (await choices.count()) await choices.first().click();
  if (kind === 'image' && placement === 'together') {
    const cards = await dialog.locator('[data-select-reference]').all();
    for (const card of cards.slice(1)) await card.click();
    if (cards.length > 1) await dialog.locator('[data-bench="0"] > h4').click();
  }
}
module.exports = { classifyAll };
