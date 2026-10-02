import { expect, test } from '@playwright/test'

test('visual nudge affects only its row with shared step and undo', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('歌詞ファイル', { exact: true }).setInputFiles({
    name: 'test.lrc',
    mimeType: 'text/plain',
    buffer: Buffer.from('[00:08.40]歌詞 1\n[00:14.20]歌詞 2'),
  })
  await page.getByRole('button', { name: '1行目を早める', exact: true }).click()
  await expect(page.getByLabel('タイムスタンプ 1', { exact: true })).toHaveValue('00:08.30')
  await expect(page.getByLabel('タイムスタンプ 2', { exact: true })).toHaveValue('00:14.20')
  await page.getByRole('button', { name: '1行目を遅らせる', exact: true }).click()
  await expect(page.getByLabel('タイムスタンプ 1', { exact: true })).toHaveValue('00:08.40')
  await page.getByLabel('行の微調整幅', { exact: true }).selectOption('0.01')
  await page.getByRole('button', { name: '1行目を遅らせる', exact: true }).click()
  await expect(page.getByLabel('タイムスタンプ 1', { exact: true })).toHaveValue('00:08.41')
  await page.getByRole('button', { name: '元に戻す', exact: true }).click()
  await expect(page.getByLabel('タイムスタンプ 1', { exact: true })).toHaveValue('00:08.40')
  await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  const field = page.getByLabel('歌詞 / LRC', { exact: true })
  await field.fill('[00:00.05]最初\n未同期')
  await page.getByRole('tab', { name: '歌詞編集', exact: true }).click()
  await page.getByLabel('行の微調整幅', { exact: true }).selectOption('0.1')
  await page.getByRole('button', { name: '1行目を早める', exact: true }).click()
  await expect(page.getByLabel('タイムスタンプ 1', { exact: true })).toHaveValue('00:00.00')
  await expect(page.getByRole('button', { name: '1行目を早める', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '2行目を早める', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '2行目を遅らせる', exact: true })).toBeDisabled()
})
test('Alt K/J adjusts cursor row without audio, preserves multiple stamps and cursor', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  const field = page.getByLabel('歌詞 / LRC', { exact: true })
  const original = '[ti:曲名]\n[offset:300]\n[00:59.95][02:00.00]同じ歌詞\n[00:20.00]別の行\n未同期'
  await field.fill(original)
  const cursor = original.indexOf('同じ歌詞') + 2
  await field.evaluate((el: HTMLTextAreaElement, pos) => {
    el.focus()
    el.setSelectionRange(pos, pos)
  }, cursor)
  await field.press('Alt+j')
  await expect(field).toHaveValue(
    '[ti:曲名]\n[offset:300]\n[01:00.05][02:00.10]同じ歌詞\n[00:20.00]別の行\n未同期',
  )
  expect(await field.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(cursor)
  await field.press('Alt+k')
  await expect(field).toHaveValue(original)
  await page.getByLabel('行の微調整幅', { exact: true }).selectOption('0.01')
  await field.focus()
  await field.press('Alt+k')
  await expect(field).toHaveValue(/\[00:59.94\]\[01:59.99\]同じ歌詞/)
  await field.press('Control+z')
  await expect(field).toHaveValue(original)
  await field.press('Control+Shift+z')
  await expect(field).toHaveValue(/\[00:59.94\]/)
  const changed = await field.inputValue()
  await field.evaluate((el: HTMLTextAreaElement) => {
    const pos = el.value.indexOf('未同期')
    el.setSelectionRange(pos, pos)
  })
  await field.press('Alt+j')
  await expect(field).toHaveValue(changed)
  await expect(page.getByRole('status')).toContainText('タイムスタンプのある歌詞行')
  await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(1, 1))
  await field.press('Alt+k')
  await expect(field).toHaveValue(changed)
  await page.waitForTimeout(650)
  await page.reload()
  await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  await expect(field).toHaveValue(changed)
})
test('mobile nudge controls remain visible without overflowing the screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await page.getByLabel('歌詞ファイル', { exact: true }).setInputFiles({
    name: 'test.lrc',
    mimeType: 'text/plain',
    buffer: Buffer.from('[00:08.40]歌詞 1\n[00:14.20]歌詞 2'),
  })
  await expect(page.getByRole('button', { name: '1行目を早める', exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: '1行目を遅らせる', exact: true })).toBeInViewport()
  await page.getByRole('button', { name: '1行目を早める', exact: true }).click()
  await expect(page.getByLabel('タイムスタンプ 1', { exact: true })).toHaveValue('00:08.30')
  await expect(page.getByLabel('行の微調整幅', { exact: true })).toBeInViewport()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
    ),
  ).toBe(true)
  await page.screenshot({ path: test.info().outputPath('lrc-nudge-mobile.png') })
})
