import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { cardLimitUsagePercent } from '../../components/wallet/BankStack';

test('medidor de limite usa o disponível exibido e fica entre 0 e 100', () => {
  assert.equal(cardLimitUsagePercent(10000, 2394), 76);
  assert.equal(cardLimitUsagePercent(10000, 10000), 0);
  assert.equal(cardLimitUsagePercent(1000, -50), 100);
  assert.equal(cardLimitUsagePercent(1000, 1200), 0);
  assert.equal(cardLimitUsagePercent(0, 100), null);
  assert.equal(cardLimitUsagePercent(1000, Number.NaN), null);
});

test('no computador com mouse os cartões ficam lado a lado; no celular a pilha continua', () => {
  const stack = fs.readFileSync('components/wallet/BankStack.tsx', 'utf8');
  assert.match(stack, /\(min-width: 1024px\) and \(hover: hover\) and \(pointer: fine\)/);
  assert.match(stack, /isDesktop \? <>/);
  assert.match(stack, /role="radiogroup" aria-label="Escolher cartão"/);
  assert.match(stack, /role="radio" aria-checked=\{isSelected\}/);
  // Mouse: inclina com o cursor, verso por botão, setas trocam de cartão.
  assert.match(stack, /onPointerMove=\{tilt\} onPointerLeave=\{resetTilt\}/);
  assert.match(stack, /'Ver frente' : 'Ver verso'/);
  assert.match(stack, /event\.key === 'ArrowLeft' \|\| event\.key === 'ArrowRight'/);
  assert.match(stack, /motion-reduce:\[transform:none\]/);
  // Celular mantém deslizar e tocar para virar.
  assert.match(stack, /Toque para virar · Deslize para trocar/);
  // Ações valem para os dois modos.
  assert.match(stack, /\{selected && <>\s*<div className=\{`mt-2 grid grid-cols-3 gap-1\.5/);
  const page = fs.readFileSync('features/wallet/pages/WalletCardsPage.tsx', 'utf8');
  assert.match(page, /cardMovements=\{data \|\| undefined\}/);
  assert.doesNotMatch(page, /lg:sticky lg:top-6 lg:col-span-5/);
});

test('cartão mostra limite (do banco ou estimado) e o medidor "Gasto" no celular e na fileira', () => {
  const stack = fs.readFileSync('components/wallet/BankStack.tsx', 'utf8');
  assert.match(stack, /<LimitMeter percent=\{usage\} spent=\{spentFromAvailable\(Number\(card\.credit_limit\), availability\.amount\)\}/);
  assert.match(stack, /<LimitMeter percent=\{selectedUsage\} spent=\{selectedSpent\} className="self-end" \/>/);
  // Frente sem informação vazia: sem rótulo genérico "CRÉDITO" nem linha de titular/validade.
  assert.doesNotMatch(stack, /brand \|\| 'CRÉDITO'/);
  assert.doesNotMatch(stack, /Titular · copiar/);
  assert.match(stack, /variant="emblem" size="xs"/);
  assert.match(stack, /aspect-\[1\.586\/1\] w-full touch-pan-y/);
  assert.match(stack, /CardLimitValues limit=\{Number\(card\.credit_limit\)\}/);
  assert.match(stack, /formatMoney\(spentFromAvailable\(limit, remaining\)\)/);
  // A origem (banco ou estimado) continua disponível ao passar o mouse.
  assert.match(stack, /title=\{origin\}/);
  assert.match(stack, /origin=\{availability\.label\}/);
});
