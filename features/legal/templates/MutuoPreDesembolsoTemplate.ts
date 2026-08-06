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

  const scheduleRows = installments.length
    ? installments.map((item: any, index) => `
        <tr>
          <td style="border: 1pt solid #000; padding: 6px; text-align: center;">${item.number ?? index + 1}</td>
          <td style="border: 1pt solid #000; padding: 6px; text-align: center;">${dateBR(item.dueDate)}</td>
          <td style="border: 1pt solid #000; padding: 6px; text-align: right;">R$ ${money(item.principalAmount ?? item.amount)}</td>
        </tr>
      `).join('')
    : `
        <tr>
          <td style="border: 1pt solid #000; padding: 6px; text-align: center;">1</td>
          <td style="border: 1pt solid #000; padding: 6px; text-align: center;">${dateBR(lastDueDate || data.contractDate)}</td>
          <td style="border: 1pt solid #000; padding: 6px; text-align: right;">R$ ${money(principal)}</td>
        </tr>
      `;

  const city = safe(data.city, 'ITACOATIARA');
  const state = safe(data.state, 'AM');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Instrumento Particular de Mútuo e Promessa de Pagamento</title>
<style>
  @page { size: A4; margin: 2.5cm 2.5cm 2.5cm 3cm; }
  body { font-family: 'Times New Roman', Times, serif; color: #000; font-size: 11pt; line-height: 1.5; text-align: justify; margin: 0; padding: 0; }
  .container { max-width: 800px; margin: auto; }
  .header-box { text-align: center; border: 2.5pt solid #000; padding: 18px; margin-bottom: 25px; }
  h1 { font-size: 13pt; margin: 0; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
  .subtitle { font-size: 9.5pt; font-weight: bold; margin-top: 6px; text-transform: uppercase; }
  h2 { font-size: 10.5pt; margin: 20px 0 10px 0; text-transform: uppercase; font-weight: bold; border-left: 3.5pt solid #000; padding-left: 8px; }
  p { margin: 8px 0; text-indent: 1.5cm; }
  .no-indent { text-indent: 0; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 10pt; }
  th, td { border: 1pt solid #000; padding: 6px; text-align: left; }
  th { background: #f2f2f2; text-align: center; font-weight: bold; text-transform: uppercase; }
  .signatures-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 35px; margin-top: 50px; page-break-inside: avoid; }
  .signature-box { border-top: 1.5pt solid #000; text-align: center; padding-top: 6px; font-size: 9pt; }
  .notice { border: 1.5pt solid #000; padding: 12px; margin: 14px 0; font-size: 9.5pt; background: #fafafa; border-left: 4pt solid #000; }
  .nota-promissoria { margin-top: 80px; border: 4pt double #000; padding: 25px; page-break-before: always; background: #fff; }
  .np-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2pt solid #000; padding-bottom: 10px; margin-bottom: 20px; }
  .np-title { font-size: 18pt; font-weight: bold; letter-spacing: 2px; }
  .np-value { font-size: 16pt; font-weight: bold; border: 2pt solid #000; padding: 6px 16px; background: #f8f8f8; }
</style>
</head>
<body>
<div class="container">
  <div class="header-box">
    <h1>INSTRUMENTO PARTICULAR DE MÚTUO FINANCEIRO E CONFISSÃO DE DÍVIDA</h1>
    <div class="subtitle">TÍTULO EXECUTIVO EXTRAJUDICIAL — ART. 784, INCISO III DO CPC/2015</div>
    <div style="font-size: 8.5pt; margin-top: 6px; color: #333; font-family: monospace;">REGISTRO ELETRÔNICO: ${safe(docId, 'PENDENTE')} | HASH: ${safe(hash, 'AGUARDANDO_ASSINATURA').toUpperCase()}</div>
  </div>

  <p class="no-indent"><strong>MUTUANTE / CREDOR:</strong> <b>${safe(data.creditorName)}</b>, CPF/CNPJ nº <b>${safe(data.creditorDoc)}</b>, com endereço profissional em ${safe(data.creditorAddress)}.</p>
  <p class="no-indent"><strong>MUTUÁRIO / DEVEDOR:</strong> <b>${safe(data.debtorName)}</b>, CPF/CNPJ nº <b>${safe(data.debtorDoc)}</b>, residente e domiciliado(a) na ${safe(data.debtorAddress)}.</p>

  <p>As partes acima identificadas, de forma livre, consciente e espontânea, ajustam o presente contrato de mútuo fiduciário com eficácia de Título Executivo Extrajudicial, sob a égide dos artigos 586 a 592 e 784, III do Código de Processo Civil, mediante as cláusulas a seguir:</p>

  <h2>CLÁUSULA PRIMEIRA — DO OBJETO E CONDIÇÃO DE EFICÁCIA DE DESEMBOLSO</h2>
  <p>O <strong>MUTUANTE</strong> compromete-se a disponibilizar ao <strong>MUTUÁRIO</strong> a quantia líquida e certa de <strong>R$ ${money(principal)} (${valueInWords})</strong>, via transferência bancária, PIX ou comprovante eletrônico hábil.</p>
  <div class="notice">
    <strong>PARÁGRAFO ÚNICO (CONDIÇÃO DE EFICÁCIA TEMPORAL):</strong> A obrigação de restituição do capital nasce estritamente com a efetiva disponibilização dos recursos na conta do MUTUÁRIO. A assinatura digital deste instrumento antecede o desembolso e atesta a concordância irrestrita com os termos deste contrato executivo.</div>

  <h2>CLÁUSULA SEGUNDA — DA RESTITUIÇÃO DO CAPITAL E CRONOGRAMA DE PAGAMENTO</h2>
  <p>Após a confirmação do desembolso, o <strong>MUTUÁRIO</strong> obriga-se a restituir a totalidade do capital ${isInstallment ? `em ${installments.length} parcelas` : 'em pagamento único'}, conforme o plano de amortização abaixo estipulado:</p>
  <table>
    <thead>
      <tr>
        <th>Parcela nº</th>
        <th>Data de Vencimento</th>
        <th>Valor do Principal (R$)</th>
      </tr>
    </thead>
    <tbody>
      ${scheduleRows}
    </tbody>
  </table>
  <p>Vencimento final acordado: <strong>${dateBR(lastDueDate)}</strong>. O pagamento deverá ser efetuado diretamente ao CREDOR por chave PIX ou conta bancária indicada.</p>

  <h2>CLÁUSULA TERCEIRA — DOS ENCARGOS MORATÓRIOS E VENCIMENTO ANTECIPADO</h2>
  <p>O atraso no pagamento de qualquer prestação constituirá o <strong>MUTUÁRIO</strong> imediatamente em mora de pleno direito, independentemente de notificação judicial ou extrajudicial, ensejando:</p>
  <ul style="margin-left: 1.5cm; font-size: 10.5pt;">
    <li><strong>Multa Moratória Convenada de 2% (dois por cento)</strong> incidente sobre o valor inadimplido;</li>
    <li><strong>Juros de Mora Legais de 1% (um por cento) ao mês</strong> (Art. 406 do Código Civil), pro rata die;</li>
    <li><strong>Atualização Monetária</strong> calculada pelo índice oficial IPCA/IBGE desde o vencimento até o efetivo pagamento;</li>
    <li><strong>Vencimento Antecipado:</strong> O descumprimento de qualquer obrigação facultará ao CREDOR declarar vencidas antecipadamente todas as parcelas vincendas, tornando a dívida integralmente exigível.</li>
  </ul>

  <h2>CLÁUSULA QUARTA — DA RESPONSABILIDADE PATRIMONIAL E EXECUÇÃO JUDICIAL</h2>
  <p>Em conformidade com o Artigo 789 do Código de Processo Civil (CPC/2015), o <strong>MUTUÁRIO</strong> responde com todos os seus bens presentes e futuros para o cumprimento da dívida ora assumida, autorizando expressamente a inclusão de seu nome nos órgãos de proteção ao crédito (SPC/SERASA) e o ajuizamento direto de Ação de Execução de Título Extrajudicial em caso de inadimplemento.</p>

  <h2>CLÁUSULA QUINTA — DA VALIDADE DA ASSINATURA ELETRÔNICA E AUDITORIA</h2>
  <p>As partes reconhecem a plena validade jurídica, integridade e juridicidade das assinaturas eletrônicas e biométricas apostas neste documento, nos exatos termos do Artigo 10 da Medida Provisória nº 2.200-2/2001 e da Lei Federal nº 14.063/2020, concordando que o hash criptográfico e os logs de IP e geolocalização constituem prova documental plena da autoria e concordância.</p>

  <h2>CLÁUSULA SEXTA — DO FORO DE ELEIÇÃO</h2>
  <p>Para dirimir quaisquer controvérsias oriundas deste instrumento, as partes elegem expressamente o Foro da Comarca de <strong>${city} — ${state}</strong>, renunciando a qualquer outro, por mais privilegiado que seja.</p>

  <p style="margin-top: 35px; text-align: center;"><strong>${city} — ${state}</strong>, <strong>${dateBR(data.contractDate)}</strong>.</p>

  <div class="signatures-grid">
    <div class="signature-box">
      <b>${safe(data.creditorName)}</b><br/>
      MUTUANTE / CREDOR<br/>
      <small>CPF/CNPJ: ${safe(data.creditorDoc)}</small>
    </div>
    <div class="signature-box">
      <b>${safe(data.debtorName)}</b><br/>
      MUTUÁRIO / DEVEDOR<br/>
      <small>CPF/CNPJ: ${safe(data.debtorDoc)}</small>
    </div>
  </div>

  <p style="margin-top: 40px; font-weight: bold; font-size: 9.5pt; text-transform: uppercase;" class="no-indent">TESTEMUNHAS INSTRUMENTÁRIAS (ART. 784, III DO CPC):</p>
  <div class="signatures-grid" style="margin-top: 25px;">
    <div class="signature-box">
      <b>${safe(data.witness1Name, 'TESTEMUNHA 1')}</b><br/>
      CPF: ${safe(data.witness1Doc)}
    </div>
    <div class="signature-box">
      <b>${safe(data.witness2Name, 'TESTEMUNHA 2')}</b><br/>
      CPF: ${safe(data.witness2Doc)}
    </div>
  </div>

  <!-- NOTA PROMISSÓRIA VINCULADA -->
  <div class="nota-promissoria">
    <div class="np-header">
      <div class="np-title">NOTA PROMISSÓRIA</div>
      <div class="np-value">R$ ${money(principal)}</div>
    </div>
    <p class="no-indent">Ao(s) <b>${dateBR(lastDueDate)}</b>, pagarei por esta única via de Nota Promissória a <b>${safe(data.creditorName)}</b>, CPF/CNPJ nº ${safe(data.creditorDoc)}, ou à sua ordem, a quantia exata de <b>R$ ${money(principal)} (${valueInWords})</b> em moeda corrente nacional.</p>
    <p class="no-indent" style="font-size: 8.5pt; color: #444; margin-top: 15px;"><strong>VÍNCULO EXECUTIVO:</strong> Esta Nota Promissória vincula-se ao Instrumento Particular de Mútuo ID ${safe(docId, '---')}. A liquidação do contrato quitará automaticamente o presente título.</p>
    
    <div style="margin-top: 45px; border-top: 1.5pt solid #000; width: 65%; text-align: center; padding-top: 6px; font-size: 9.5pt; text-transform: uppercase; font-weight: bold;">
      Assinatura do Emitente (${safe(data.debtorName)})
    </div>
  </div>
</div>
</body>
</html>`;
};
