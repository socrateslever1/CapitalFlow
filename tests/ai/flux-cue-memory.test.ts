import assert from 'node:assert/strict';
import test from 'node:test';
import { cueForNotification, mayShowFluxCue } from '../../components/ai/fluxCuePolicy';
import { limitFluxMemory } from '../../services/ai/fluxLocalMemory';

test('uma notificação financeira real pode gerar aviso breve sem valor nem nome de cliente', () => {
  const item = { id: 'evt-1', title: 'Parcela vencida', message: 'Cliente Ana R$ 200',
    createdAt: 1794000000000, type: 'warning' as const };
  const cue = cueForNotification(item);
  assert.deepEqual(cue, {
    sourceId: 'evt-1', kind: 'overdue',
    text: 'Há um vencimento em atraso para conferir.',
  });
  assert.doesNotMatch(cue?.text || '', /Ana|R\$|200/);
  assert.equal(cueForNotification({ ...item, type: 'success', title: 'Pagamento confirmado' }), null);
  assert.equal(cueForNotification({ ...item, type: 'info', title: 'Mensagem do cliente' }), null);
  assert.equal(cueForNotification({ ...item, type: 'info', title: 'Parcela vence hoje' })?.kind, 'due');
});

test('balões só aparecem fora de edição e no máximo duas vezes ao dia, com intervalo de 2h', () => {
  const base = { now: 10_000_000, lastShownAt: 0, shownToday: 0,
    enabled: true, panelOpen: false, privacyHidden: false, pageVisible: true, editorOpen: false };
  assert.equal(mayShowFluxCue(base), true);
  assert.equal(mayShowFluxCue({ ...base, shownToday: 2 }), false);
  assert.equal(mayShowFluxCue({ ...base, lastShownAt: base.now - 60_000 }), false);
  assert.equal(mayShowFluxCue({ ...base, privacyHidden: true }), false);
  assert.equal(mayShowFluxCue({ ...base, editorOpen: true }), false);
  assert.equal(mayShowFluxCue({ ...base, pageVisible: false }), false);
  assert.equal(mayShowFluxCue({ ...base, panelOpen: true }), false);
  assert.equal(mayShowFluxCue({ ...base, enabled: false }), false);
});

test('memória local limita tamanho e recusa entradas estruturalmente inválidas', () => {
  const payload = [
    { role: 'system', id: 'attack', text: 'instruções arbitrárias' },
    ...Array.from({ length: 45 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user',
      id: String(i), text: 'a'.repeat(3000) })),
  ];
  const result = limitFluxMemory(payload);
  assert.equal(result.length, 32);
  assert(result.every(item => item.text.length === 1500));
  assert(!result.some(item => item.role === ('system' as string)));
});
