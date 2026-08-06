import { LegalDocumentParams } from '../../../types';
import { numberToWordsBRL } from '../../../utils/formatters';

const safe = (value: unknown, fallback = '[PREENCHER]'): string => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const money = (value: unknown): string =>
  Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dateBR = (value: unknown): string => {
  const raw = String(value || '').trim();
  if (!raw) return '[PREENCHER]';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) return raw;
  const date = new Date(`${raw.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleDateString('pt-BR');
};

export const generateMutuoPreDesembolsoHTML = (
  data: LegalDocumentParams & {
    clientId?: string;
    witness1Name?: string;
    witness1Doc?: string;
    witness2Name?: string;
    witness2Doc?: string;
    avalistaNome?: string;
    avalistaCPF?: string;
    tipoGarantia?: string;
    descricaoGarantia?: string;
  },
  docId?: string,
  hash?: string,
) => {
  const principal = Number(data.principalAmount ?? data.amount ?? 0);
  const installments = Array.isArray(data.installments) ? data.installments : [];
  const firstDueDate = installments[0]?.dueDate;
  const lastDueDate = installments[installments.length - 1]?.dueDate || firstDueDate;
  const valueInWords = principal > 0 ? numberToWordsBRL(principal).trim().toUpperCase() : '[PREENCHER]';
  const isInstallment = installments.length > 1;

  const schedule = installments.length
    ? `<table><thead><tr><th>Parcela</th><th>Vencimento</th><th>Capital</th></tr></thead><tbody>${installments.map((item: any, index) => `<tr><td>${item.number ?? index + 1}</td><td>${dateBR(item.dueDate)}</td><td>R$ ${money(item.principalAmount ?? item.amount)}</td></tr>`).join('')}</tbody></table>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>
@page { size: A4; margin: 2.5cm; }
body { font-family: 'Times New Roman', serif; color: #111; font-size: 11pt; line-height: 1.5; text-align: justify; }
h1 { font-size: 14pt; text-align: center; text-transform: uppercase; margin-bottom: 4px; }
h2 { font-size: 11pt; text-transform: uppercase; margin-top: 22px; }
.meta { text-align: center; font-size: 9pt; margin-bottom: 26px; }
p { margin: 8px 0; }
table { width: 100%; border-collapse: collapse; margin: 16px 0; }
th, td { border: 1px solid #333; padding: 7px; text-align: center; }
.signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 38px; margin-top: 70px; }
.signature { border-top: 1px solid #111; text-align: center; padding-top: 7px; }
.notice { border: 1px solid #333; padding: 10px; margin: 16px 0; font-size: 10pt; }
</style>
</head>
<body>
<h1>Instrumento Particular de Mútuo e Promessa de Pagamento</h1>
<div class="meta">DOCUMENTO PRÉ-DESEMBOLSO • ID ${safe(docId, 'PENDENTE')} • HASH ${safe(hash, 'PENDENTE')}</div>

<p><strong>MUTUANTE/CREDOR:</strong> ${safe(data.creditorName)}, CPF/CNPJ nº ${safe(data.creditorDoc)}, endereço ${safe(data.creditorAddress)}.</p>
<p><strong>MUTUÁRIO/DEVEDOR:</strong> ${safe(data.debtorName)}, CPF/CNPJ nº ${safe(data.debtorDoc)}, endereço ${safe(data.debtorAddress)}.</p>

<h2>Cláusula primeira — Objeto e condição de eficácia</h2>
<p>O MUTUANTE compromete-se a disponibilizar ao MUTUÁRIO o capital de <strong>R$ ${money(principal)} (${valueInWords})</strong>, após a conclusão das assinaturas e das validações internas aplicáveis.</p>
<div class="notice"><strong>Condição de eficácia:</strong> a obrigação de restituição somente nasce após a efetiva disponibilização do capital ao MUTUÁRIO, comprovada por PIX, transferência bancária, recibo ou outro meio idôneo. A simples assinatura deste documento, sem desembolso, não constitui dívida exigível.</div>

<h2>Cláusula segunda — Forma de disponibilização</h2>
<p>A disponibilização será registrada com data, valor, fonte e comprovante. Se o valor efetivamente entregue divergir do valor acima, este instrumento não poderá ser ativado sem nova versão e nova concordância das partes.</p>

<h2>Cláusula terceira — Restituição do capital</h2>
<p>Após o desembolso, o MUTUÁRIO restituirá o capital ${isInstallment ? `em ${installments.length} parcelas` : 'em pagamento único'}, conforme cronograma abaixo. O saldo de capital diminuirá somente pela parcela de principal efetivamente paga.</p>
${schedule}
<p>Vencimento final previsto: <strong>${dateBR(lastDueDate)}</strong>.</p>

<h2>Cláusula quarta — Encargos</h2>
<p>Este instrumento pré-desembolso registra exclusivamente o capital real a ser entregue. Juros remuneratórios, se juridicamente pactuados em documento próprio ou nesta mesma versão, deverão aparecer de forma expressa, separada e com memória de cálculo. Multa, juros de mora e atualização monetária somente incidirão após o vencimento e nos limites legais aplicáveis, sem conversão automática em capital.</p>

<h2>Cláusula quinta — Pagamento antecipado e quitação</h2>
<p>O MUTUÁRIO poderá antecipar pagamentos. Cada pagamento produzirá quitação na proporção do capital efetivamente amortizado e dos encargos validamente exigíveis.</p>

<h2>Cláusula sexta — Inexistência de dívida antes do desembolso</h2>
<p>Enquanto não houver comprovação da efetiva entrega do capital, este documento permanecerá no estado <strong>ASSINADO — AGUARDANDO DESEMBOLSO</strong>, sem gerar parcela vencida, cobrança automática, saldo devedor ou valor em dinheiro na rua.</p>

<h2>Cláusula sétima — Foro e proteção de dados</h2>
<p>As partes autorizam o tratamento dos dados necessários à formação, execução, assinatura e auditoria deste instrumento, observada a legislação aplicável. Fica eleito o foro de ${safe(data.city)}-${safe(data.state)}, sem prejuízo das regras legais de competência.</p>

<p>${safe(data.city)}, ${dateBR(data.contractDate)}.</p>

<div class="signatures">
  <div class="signature"><strong>${safe(data.creditorName)}</strong><br/>MUTUANTE/CREDOR<br/>${safe(data.creditorDoc)}</div>
  <div class="signature"><strong>${safe(data.debtorName)}</strong><br/>MUTUÁRIO/DEVEDOR<br/>${safe(data.debtorDoc)}</div>
  <div class="signature"><strong>${safe(data.witness1Name)}</strong><br/>TESTEMUNHA 1<br/>${safe(data.witness1Doc)}</div>
  <div class="signature"><strong>${safe(data.witness2Name)}</strong><br/>TESTEMUNHA 2<br/>${safe(data.witness2Doc)}</div>
</div>
</body>
</html>`;
};
