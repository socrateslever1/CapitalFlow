import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaymentOfferModal } from './PaymentOfferModal';
import type { Installment, Loan } from '../../../types';

const installment = {
  id: 'fixture', dueDate: '2026-08-10', amount: 1300,
  scheduledPrincipal: 1000, scheduledInterest: 300,
  principalRemaining: 1000, interestRemaining: 300,
  lateFeeAccrued: 0, paidTotal: 0, paidPrincipal: 0, paidInterest: 0, paidLateFee: 0,
} as Installment;
const loan = {
  id: 'fixture', billingCycle: 'MONTHLY', principal: 1000,
  totalToReceive: 1300, interestRate: 30, finePercent: 2,
  dailyInterestPercent: 1, installments: [installment],
} as Loan;

const devices = [
  { name: 'iPhone Safari', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1', platform: 'iPhone', maxTouchPoints: 5, standalone: false, expected: true },
  { name: 'iPhone instalado', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148', platform: 'iPhone', maxTouchPoints: 5, standalone: true, expected: true },
  { name: 'iPadOS com identificação de Mac', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', platform: 'MacIntel', maxTouchPoints: 5, expected: true },
  { name: 'Android', userAgent: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', platform: 'Linux armv8l', maxTouchPoints: 5, expected: false },
  { name: 'Mac desktop', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15', platform: 'MacIntel', maxTouchPoints: 0, expected: false },
  { name: 'Windows com toque', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', platform: 'Win32', maxTouchPoints: 10, expected: false },
];

for (const device of devices) {
  test(`retorno interno na condição: ${device.name}`, () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    try {
      Object.defineProperty(globalThis, 'navigator', { configurable: true, value: device });
      const markup = renderToStaticMarkup(
        <PaymentOfferModal loan={loan} installment={installment} onClose={() => {}} onSaved={() => {}} />
      );
      assert.equal(markup.includes('aria-label="Voltar"'), device.expected);
      assert.ok(markup.includes('Condição de pagamento'));
      assert.ok(markup.includes('Enviar para o portal'));
    } finally {
      if (previous) Object.defineProperty(globalThis, 'navigator', previous);
      else Reflect.deleteProperty(globalThis, 'navigator');
    }
  });
}
