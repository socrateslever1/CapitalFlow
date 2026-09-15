import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload();
});

test('login principal renderiza com campos e senha protegida', async ({ page }) => {
  const email = page.getByPlaceholder('Seu E-mail');
  const password = page.getByPlaceholder('Senha');

  await expect(email).toBeVisible();
  await expect(password).toBeVisible();
  await expect(password).toHaveAttribute('type', 'password');
  await expect(page.getByRole('button', { name: /^Entrar$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Entrar com Google/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Modo Demonstração/i })).toBeVisible();
});

test('modo demonstração cria sessão local sem credencial real', async ({ page }) => {
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((item) =>
      /Modo Demonstração/i.test(item.textContent || ''),
    );
    if (!(button instanceof HTMLButtonElement)) throw new Error('Botão Modo Demonstração não encontrado');
    button.click();
  });

  await page.waitForFunction(() => {
    const raw = localStorage.getItem('cm_session');
    if (!raw) return false;
    try {
      return JSON.parse(raw)?.profileId === 'DEMO';
    } catch {
      return false;
    }
  });

  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('cm_session') || 'null'));
  expect(session?.profileId).toBe('DEMO');
  expect(Number(session?.ts)).toBeGreaterThan(0);
});

test('criação de conta abre sem submeter dados', async ({ page }) => {
  await page.getByRole('button', { name: /Criar Conta/i }).click();

  await expect(page.getByPlaceholder('Nome Completo')).toBeVisible();
  await expect(page.getByPlaceholder('Seu E-mail')).toBeVisible();
  await expect(page.getByPlaceholder('CPF')).toBeVisible();
});

test('layout não produz rolagem horizontal no viewport atual', async ({ page }) => {
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
});
