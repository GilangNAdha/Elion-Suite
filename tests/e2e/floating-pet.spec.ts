import { test, expect, type Page } from '@playwright/test'

const pet = (page: Page) => page.locator('.floating-nova')
const activation = (page: Page) => page.getByRole('switch', { name: /Keep Elion on top/ })
async function settings(page: Page) {
  await page.goto('/settings#companion')
  await expect(page.getByRole('heading', { name: 'Elion, your friend', exact: true })).toBeVisible()
}

test('Elion is an overlay, not a separate navigation page or dashboard card', async ({ page }) => {
  await page.goto('/')
  await expect(pet(page)).toHaveCount(1)
  await expect(
    page
      .getByRole('navigation', { name: 'Primary', exact: true })
      .getByRole('link', { name: 'Companion', exact: true })
  ).toHaveCount(0)
  await expect(page.locator('.nova-dashboard-tile')).toHaveCount(0)
  await page.goto('/pet')
  await expect(page).toHaveURL(/\/settings#companion$/)
  await expect(page.getByRole('heading', { name: 'Elion, your friend', exact: true })).toBeVisible()
  await expect(pet(page)).toBeVisible()
})

test('Settings activation works immediately, persists, and closes any open chat', async ({ page }) => {
  await settings(page)
  await expect(activation(page)).toHaveAttribute('aria-checked', 'true')
  await expect(pet(page)).toHaveCount(1)
  // No second animated showcase inside Settings.
  await expect(page.locator('#companion .nova-pet')).toHaveCount(0)
  await page.getByRole('button', { name: 'Chat with Elion', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Elion chat', exact: true })).toBeVisible()
  await activation(page).click()
  await expect(pet(page)).toHaveCount(0)
  await expect(page.getByRole('dialog', { name: 'Elion chat', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(activation(page)).toHaveAttribute('aria-checked', 'false')
  await expect(pet(page)).toHaveCount(0)
  await activation(page).click()
  await expect(pet(page)).toBeVisible()
  await page.reload()
  await expect(pet(page)).toBeVisible()
})

test('friend interactions animate locally without opening a page or invoking MiniCPM', async ({ page }) => {
  let modelRequests = 0
  await page.route('**/api/companion/**', (route) => {
    modelRequests++
    return route.abort()
  })
  await settings(page)
  const url = page.url()
  await pet(page).getByRole('button', { name: 'Interact with Elion', exact: true }).click()
  const controls = page.getByRole('dialog', { name: 'Elion controls', exact: true })
  await expect(controls).toBeVisible()
  await controls.getByRole('button', { name: 'High five Elion', exact: true }).click()
  await expect(pet(page).locator('.nova-pet')).toHaveAttribute('data-pose', 'happy')
  await expect(pet(page).getByRole('status')).toContainText('Elion is happy')
  const frame = await pet(page).locator('[data-frame]').getAttribute('data-frame')
  await expect.poll(() => pet(page).locator('[data-frame]').getAttribute('data-frame')).not.toBe(frame)
  await controls.getByRole('button', { name: 'Let Elion rest', exact: true }).click()
  await expect(pet(page).locator('.nova-pet')).toHaveAttribute('data-pose', 'sleeping')
  await controls.getByRole('button', { name: 'Wake Elion', exact: true }).click()
  await expect(pet(page).locator('.nova-pet')).toHaveAttribute('data-pose', 'wave')
  await page.keyboard.press('Escape')
  await expect(controls).toHaveCount(0)
  await expect(pet(page).getByRole('button', { name: 'Interact with Elion', exact: true })).toBeFocused()
  expect(page.url()).toBe(url)
  expect(modelRequests).toBe(0)
})

test('the actual friend can be dragged without accidentally opening its menu', async ({ page }) => {
  await settings(page)
  const before = (await pet(page).boundingBox())!
  const avatar = (await pet(page)
    .getByRole('button', { name: 'Interact with Elion', exact: true })
    .boundingBox())!
  const start = { x: avatar.x + avatar.width / 2, y: avatar.y + avatar.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(start.x - 180, start.y - 100, { steps: 20 })
  await page.mouse.up()
  const after = (await pet(page).boundingBox())!
  expect(after.x).toBeLessThan(before.x - 100)
  expect(after.y).toBeLessThan(before.y - 50)
  await expect(page.getByRole('dialog', { name: 'Elion controls', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(pet(page)).toBeVisible()
  const restored = (await pet(page).boundingBox())!
  expect(restored.x).toBeCloseTo(after.x, 0)
  expect(restored.y).toBeCloseTo(after.y, 0)
  await pet(page).getByRole('button', { name: 'Interact with Elion', exact: true }).click()
  const panel = (await page.getByRole('dialog', { name: 'Elion controls', exact: true }).boundingBox())!
  expect(panel.x + panel.width).toBeLessThanOrEqual(restored.x)
})

test('animation can be disabled separately while pet actions remain functional', async ({ page }) => {
  await settings(page)
  await page.getByRole('switch', { name: /Animate Elion/ }).click()
  await expect(pet(page).locator('.nova-pet')).toHaveAttribute('data-animated', 'false')
  const frame = await pet(page).locator('[data-frame]').getAttribute('data-frame')
  await page.waitForTimeout(400)
  expect(await pet(page).locator('[data-frame]').getAttribute('data-frame')).toBe(frame)
  await pet(page).getByRole('button', { name: 'Interact with Elion', exact: true }).click()
  await page.getByRole('button', { name: 'Wave hello', exact: true }).click()
  await expect(pet(page).locator('.nova-pet')).toHaveAttribute('data-pose', 'wave')
  await page.reload()
  await expect(page.getByRole('switch', { name: /Animate Elion/ })).toHaveAttribute('aria-checked', 'false')
  await expect(pet(page).locator('.nova-pet')).toHaveAttribute('data-animated', 'false')
})

test('Elion follows the user into Lockdown and works on narrow screens', async ({ page }) => {
  await page.goto('/lockdown')
  await page.getByRole('button', { name: 'Start focus session', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause focus', exact: true })).toBeVisible()
  await expect(pet(page)).toHaveCount(1)
  await expect(page.locator('.focus-companion')).toHaveCount(0)
  await pet(page).getByRole('button', { name: 'Interact with Elion', exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Elion controls', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Close Elion controls', exact: true }).click()
  await page.getByRole('button', { name: 'Exit Lockdown', exact: true }).click()
  await page
    .getByRole('dialog', { name: 'Session saved' })
    .getByRole('button', { name: 'Back to dashboard', exact: true })
    .click()
  await page.setViewportSize({ width: 375, height: 812 })
  await settings(page)
  await expect(pet(page)).toBeVisible()
  await pet(page).getByRole('button', { name: 'Interact with Elion', exact: true }).click()
  const actions = (await page.getByRole('dialog', { name: 'Elion controls', exact: true }).boundingBox())!
  expect(actions.x).toBeGreaterThanOrEqual(0)
  expect(actions.x + actions.width).toBeLessThanOrEqual(375)
  expect(actions.y + actions.height).toBeLessThanOrEqual(812)
  await page.getByRole('button', { name: 'Start a chat', exact: true }).click()
  const chat = (await page.getByRole('dialog', { name: 'Elion chat', exact: true }).boundingBox())!
  expect(chat.x).toBeGreaterThanOrEqual(0)
  expect(chat.x + chat.width).toBeLessThanOrEqual(375)
  await expect(page.getByRole('textbox', { name: 'Message Elion', exact: true })).toBeVisible()
})
