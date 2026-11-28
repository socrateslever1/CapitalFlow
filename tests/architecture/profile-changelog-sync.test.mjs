import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('changelog técnico e histórico do Perfil exibem a mesma data de atualização mais recente', () => {
  const markdown = read('CHANGELOG.md');
  const profile = read('src/constants/changelog.ts');
  const technical = markdown.match(/^## (\d{2}\/\d{2}\/\d{4}) — /m);
  const inApp = profile.match(/date: '(\d{2}\/\d{2}\/\d{4})'/);
  assert.ok(technical && inApp, 'Ambos os registros exigem datas explícitas');
  assert.equal(inApp[1], technical[1], 'O log do Perfil não pode ficar atrasado em relação ao CHANGELOG.md');
  const allDates = [...profile.matchAll(/date: '(\d{2}\/\d{2}\/\d{4})'/g)].map((match) => {
    const [day, month, year] = match[1].split('/').map(Number);
    return year * 10000 + month * 100 + day;
  });
  assert.ok(allDates.every((date, index) => index === 0 || allDates[index - 1] >= date), 'Histórico deve ter datas decrescentes');
  assert.match(profile, /commit\?: string/, 'Atualizações sem incremento de versão devem manter referência do commit');
  assert.match(read('features/profile/components/ProfileChangelog.tsx'), /release\.commit \? `Código /);
});

test('resumos de 20 a 22/11 estão no Perfil e no log técnico, sem afirmar nova versão assinada', () => {
  const markdown = read('CHANGELOG.md');
  const profile = read('src/constants/changelog.ts');
  for (const date of ['20/11/2026', '21/11/2026', '22/11/2026']) {
    assert.ok(markdown.includes(date), `Falta ${date} no CHANGELOG.md`);
    assert.ok(profile.includes(date), `Falta ${date} no histórico do Perfil`);
  }
  assert.match(read('AGENTS.md'), /os dois registros no mesmo commit/);
});
