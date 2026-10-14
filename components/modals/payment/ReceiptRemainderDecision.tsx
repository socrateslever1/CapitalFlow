import React from 'react';
import { formatMoney } from '../../../utils/formatters';
import type { ReceiptBusinessAction } from '../../../services/payments/receiptDecision';

interface ReceiptRemainderDecisionProps {
  remainingInterest: number;
  value: ReceiptBusinessAction;
  onChange: (value: ReceiptBusinessAction) => void;
  isOnline?: boolean;
  isStealthMode?: boolean;
}

const choices: Array<{
  value: ReceiptBusinessAction;
  title: string;
  detail: string;
}> = [
  {
    value: 'CAPITALIZE_REMAINDER',
    title: 'Somar falta ao capital',
    detail: 'A diferença dos juros vira capital e o contrato segue para o próximo ciclo.',
  },
  {
    value: 'KEEP_REMAINDER_PENDING',
    title: 'Deixar pendente',
    detail: 'Mantém a diferença separada para cobrar depois, sem transformar em capital.',
  },
  {
    value: 'RENEW_WITH_DISCOUNT',
    title: 'Renovar com desconto',
    detail: 'Dispensa a diferença dos juros, registra o desconto e inicia o próximo ciclo.',
  },
];

export const ReceiptRemainderDecision: React.FC<ReceiptRemainderDecisionProps> = ({
  remainingInterest,
  value,
  onChange,
  isOnline = true,
  isStealthMode = false,
}) => (
  <section className="space-y-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.05] p-3">
    <div>
      <p className="text-[9px] font-black uppercase tracking-wide text-amber-300">Valor abaixo dos juros</p>
      <p className="mt-0.5 text-[9px] leading-4 text-slate-400">
        Faltam {formatMoney(remainingInterest, isStealthMode)} para quitar os juros deste ciclo. Escolha como tratar somente essa diferença.
      </p>
    </div>

    <div className="grid grid-cols-1 gap-1.5">
      {choices.map((choice) => {
        const disabled = choice.value === 'RENEW_WITH_DISCOUNT' && !isOnline;
        const selected = value === choice.value;
        return (
          <button
            key={choice.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(choice.value)}
            className={`rounded-lg border px-3 py-2 text-left transition-all disabled:cursor-not-allowed disabled:opacity-35 ${
              selected
                ? 'border-amber-400/45 bg-amber-500/10 text-amber-200'
                : 'border-slate-700 bg-slate-950/75 text-slate-300 hover:border-slate-600'
            }`}
          >
            <span className="block text-[9px] font-black uppercase">{choice.title}</span>
            <span className="mt-0.5 block text-[8px] leading-3.5 text-slate-500">{choice.detail}</span>
          </button>
        );
      })}
    </div>

    {value === 'RENEW_WITH_DISCOUNT' && (
      <p className="text-[8px] font-semibold leading-3.5 text-amber-200/80">
        A diferença dispensada fica registrada como desconto auditável.
      </p>
    )}
  </section>
);
