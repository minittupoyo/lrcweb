import { expect, test } from '@playwright/test'

test('reset requires confirmation and clears lyrics, audio, settings and persisted history', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  await page
    .getByLabel('歌詞 / LRC', { exact: true })
    .fill('[ti:編集曲]\n[ar:作者]\n[al:作品]\n[offset:300]\n[00:01.00]編集中の歌詞')
  const sampleRate = 8000,
    wav = Buffer.alloc(44 + sampleRate * 4 * 2)
  wav.write('RIFF')
  wav.writeUInt32LE(wav.length - 8, 4)
  wav.write('WAVE', 8)
  wav.write('fmt ', 12)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate * 2, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(wav.length - 44, 40)
  await page
    .getByLabel('音声ファイル', { exact: true })
    .setInputFiles({ name: 'test.wav', mimeType: 'audio/wav', buffer: wav })
  await expect(page.locator('audio')).toHaveJSProperty('duration', 4)
  await page.getByLabel('再生速度', { exact: true }).selectOption('1.5')
  await page.getByLabel('音量', { exact: true }).fill('0.3')
  await page.getByRole('button', { name: '再生', exact: true }).click()
  await page.getByRole('button', { name: 'リセット', exact: true }).click()
  await expect(page.getByRole('button', { name: 'キャンセル', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'キャンセル', exact: true }).click()
  await expect(page.getByLabel('歌詞 / LRC', { exact: true })).toHaveValue(/編集中の歌詞/)
  await expect(page.locator('audio')).toHaveJSProperty('paused', false)
  await page.getByRole('button', { name: 'リセット', exact: true }).click()
  await page.getByRole('button', { name: 'リセットする', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('歌詞なし', { exact: true })).toBeVisible()
  await expect(page.locator('audio')).not.toHaveAttribute('src', /.+/)
  await expect(page.locator('audio')).toHaveJSProperty('paused', true)
  await expect(page.getByLabel('再生速度', { exact: true })).toHaveValue('1')
  await expect(page.getByLabel('音量', { exact: true })).toHaveValue('0.8')
  await expect(page.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'やり直す', exact: true })).toBeDisabled()
  await expect(page.getByLabel('曲名', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('アーティスト', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('アルバム', { exact: true })).toHaveValue('')
  await expect(page.locator('#offset')).toHaveValue('0')
  // Reload immediately to verify the cleared project is persisted without waiting for autosave.
  await page.reload()
  await expect(page.getByText('歌詞なし', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: 'テキスト / LRC', exact: true }).click()
  await expect(page.getByLabel('歌詞 / LRC', { exact: true })).toHaveValue('')
})
test('reset dialog is usable on mobile and Escape preserves the project', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/')
  await page.getByRole('button', { name: 'リセット', exact: true }).click()
  await expect(page.getByRole('button', { name: 'リセットする', exact: true })).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('歌詞なし', { exact: true })).toBeVisible()
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollHeight <= innerHeight &&
        document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true)
})
