import assert from 'node:assert/strict';
import test from 'node:test';

import { generateConfissaoDividaV2HTML } from './ConfissaoDividaV2Template';

const baseDocument = {
  amount: 1000,
  totalDebt: 1000,
  contractDurationDays: 30,
  contractDate: '2026-08-11',
  city: 'Itacoatiara',
  creditorName: 'Manoel Sócrates Costa Lever',
  creditorDoc: '831.923.362-34',
  creditorAddress: 'Endereço do credor',
  debtorName: 'Alan Jesiel Cardoso dos Santos',
  debtorDoc: '018.266.932-70',
  debtorAddress: 'Endereço do devedor',
  witnesses: [
    { name: 'Cassia Maria da Silva Batista', document: '012.453.512-73' },
    { name: 'William Gemaque Leal', document: '026.117.092-97' },
  ],
  installments: [{ amount: 1000, dueDate: '2026-09-10' }],
} as any;

test('renders the unified debt confession without embedded promissory note or legacy header metadata', () => {
  const html = generateConfissaoDividaV2HTML(baseDocument);

  assert.match(html, /<header class="document-header">\s*<h1>INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA<\/h1>/);
  assert.doesNotMatch(html, /NOTA PROMISSÓRIA/);
  assert.doesNotMatch(html, /PROMESSA DE PAGAMENTO/);
  assert.doesNotMatch(html, /TÍTULO EXECUTIVO EXTRAJUDICIAL - ART\. 784/);
  assert.doesNotMatch(html, /MODALIDADE:/);
  assert.doesNotMatch(html, /CapitalFlow Compliance System/);
  assert.doesNotMatch(html, /header-box/);
});

test('keeps payment terms in the clauses and renders compact organized signatures', () => {
  const html = generateConfissaoDividaV2HTML(baseDocument);

  assert.match(html, /CLÁUSULA SEGUNDA - DA FORMA E LOCAL DE PAGAMENTO/);
  assert.match(html, /class="signature-section"/);
  assert.match(html, /class="signature-name"/);
  assert.match(html, /class="signature-role"/);
  assert.match(html, /class="signature-cpf">CPF: 831\.923\.362-34/);
  assert.doesNotMatch(html, />DOC:/);
  assert.match(html, /@page \{ size: A4; margin: 18mm 20mm 20mm 24mm; \}/);
});

test('uses visible CPF labels and clear placeholders for witnesses not selected yet', () => {
  const html = generateConfissaoDividaV2HTML({ ...baseDocument, witnesses: [] });

  assert.match(html, /Testemunha a definir/);
  assert.match(html, /class="signature-cpf">CPF: A definir/);
  assert.doesNotMatch(html, /NÃO INFORMADO/);
  assert.match(html, /\.signature-cpf[\s\S]*color: #111;[\s\S]*font-size: 7\.5pt;[\s\S]*font-weight: 700;/);
});

test('preserves the renegotiation title in the same unified template', () => {
  const html = generateConfissaoDividaV2HTML({
    ...baseDocument,
    isAgreement: true,
    agreementDate: '2026-08-11',
  });

  assert.match(html, /<h1>TERMO DE RENEGOCIAÇÃO E CONFISSÃO DE DÍVIDA<\/h1>/);
  assert.doesNotMatch(html, /NOTA PROMISSÓRIA/);
});

test('describes a partially paid contract using its actual balance composition', () => {
  const html = generateConfissaoDividaV2HTML({
    ...baseDocument,
    loanId: '12345678-abcd-0000-0000-000000000000',
    amount: 800,
    totalDebt: 800,
    originalPrincipalAmount: 1000,
    principalPaidAmount: 200,
    principalAmount: 800,
    installments: [{ number: 2, amount: 800, dueDate: '2026-09-10' }],
  });

  assert.match(html, /Contrato de origem nº 12345678/);
  assert.match(html, /Capital originalmente disponibilizado[\s\S]*R\$ 1\.000,00/);
  assert.match(html, /Capital já pago e abatido[\s\S]*R\$ 200,00/);
  assert.match(html, /Saldo de capital confessado[\s\S]*R\$ 800,00/);
  assert.doesNotMatch(html, /recebeu[^<]*R\$ 800,00/);
});

test('renders the real variable installment schedule and respects optional clauses', () => {
  const html = generateConfissaoDividaV2HTML({
    ...baseDocument,
    amount: 1000,
    totalDebt: 1000,
    installments: [
      { number: 1, amount: 400, dueDate: '2026-09-10' },
      { number: 2, amount: 600, dueDate: '2026-10-10' },
    ],
    clauses: { penhora: false, foro: false, multa: false },
  });

  assert.match(html, /<td>R\$ 400,00<\/td>/);
  assert.match(html, /<td>R\$ 600,00<\/td>/);
  assert.doesNotMatch(html, /parcelas fixas/);
  assert.doesNotMatch(html, /MULTA MORATÓRIA/);
  assert.doesNotMatch(html, /CLÁUSULA QUARTA - DA COBRANÇA/);
  assert.doesNotMatch(html, /Fica eleito o Foro/);
});

test('formats ISO due dates without timezone day drift', () => {
  const html = generateConfissaoDividaV2HTML({
    ...baseDocument,
    installments: [{ amount: 1000, dueDate: '2026-09-10' }],
  });

  assert.match(html, /10\/09\/2026/);
  assert.doesNotMatch(html, /09\/09\/2026/);
});

test('includes only guarantees and guarantors backed by contract data', () => {
  const withGuarantee = generateConfissaoDividaV2HTML({
    ...baseDocument,
    incluirGarantia: true,
    descricaoGarantia: 'Motocicleta placa ABC1D23',
  });
  const incompleteGuarantor = generateConfissaoDividaV2HTML({
    ...baseDocument,
    incluirAvalista: true,
    avalistaNome: '',
    avalistaCPF: '',
  });

  assert.match(withGuarantee, /Motocicleta placa ABC1D23/);
  assert.doesNotMatch(incompleteGuarantor, /CLÁUSULA DE COOBRIGAÇÃO/);
  assert.doesNotMatch(incompleteGuarantor, /class="signature-role">AVALISTA/);
});
