import { test, expect } from '@playwright/test'

const TEST_EMAIL = `test-${Date.now()}@example.com`
const TEST_PASSWORD = 'testpassword123'

test.describe('Auth flow', () => {
  test('should show login page by default', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
    await expect(page.locator('h1')).toHaveText('Just an Assistant')
  })

  test('should sign up and redirect to chat', async ({ page }) => {
    await page.goto('/login')

    await page.getByText('Sign Up', { exact: true }).click()
    await page.getByPlaceholder('Email').fill(TEST_EMAIL)
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /sign up/i }).click()

    await expect(page.locator('.chat-page')).toBeVisible({ timeout: 10000 })
  })

  test('should sign in with existing account', async ({ page }) => {
    await page.goto('/login')

    await page.getByPlaceholder('Email').fill(TEST_EMAIL)
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()

    await expect(page.locator('.chat-page')).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Chat flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('Email').fill(TEST_EMAIL)
    await page.getByPlaceholder('Password').fill(TEST_PASSWORD)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.locator('.chat-page')).toBeVisible({ timeout: 10000 })
  })

  test('should show empty chat state', async ({ page }) => {
    await expect(page.locator('.empty-chat h2')).toHaveText('Just an Assistant')
  })

  test('should send a message and get a response', async ({ page }) => {
    const textarea = page.locator('.input-container textarea')
    await textarea.fill('Hello, who are you?')
    await page.locator('.input-container button').click()

    await expect(page.locator('.message-bubble.user')).toBeVisible()
    await expect(page.locator('.message-bubble.assistant')).toBeVisible({ timeout: 30000 })
  })

  test('should create conversation in sidebar after first message', async ({ page }) => {
    const textarea = page.locator('.input-container textarea')
    await textarea.fill('Testing conversation creation')
    await page.locator('.input-container button').click()

    await expect(page.locator('.conversation-item').first()).toBeVisible({ timeout: 30000 })
  })
})
