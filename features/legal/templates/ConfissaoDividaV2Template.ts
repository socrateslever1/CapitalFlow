import { LegalDocumentParams } from "../../../types";
import { numberToWordsBRL } from "../../../utils/formatters";
import { buildConfissaoDividaVM } from "../viewModels/confissaoVM";

const FILL = "Não informado";

const safeText = (value: unknown, fallback = "Não informado"): string => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  if (text === '[PREENCHER]' || text.length === 0) return fallback;
  return text;
};

const safeDateBR = (value: unknown, fallback?: string): string => {
  if (!value) return fallback || new Date().toLocaleDateString("pt-BR");
  const str = String(value).trim();
  if (str === '[PREENCHER]' || !str) return fallback || new Date().toLocaleDateString("pt-BR");
  if (str.includes(' de ')) return str;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  const isoDate = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  
  const date = new Date(str);
  return Number.isNaN(date.getTime()) ? (fallback || new Date().toLocaleDateString("pt-BR")) : date.toLocaleDateString("pt-BR");
};

const translateBillingCycle = (cycle?: string): string => {
  if (!cycle) return "MENSAL";
  const c = cycle.toUpperCase();
  if (c === "DAILY" || c.startsWith("DAILY")) return "DIÁRIO";
  if (c === "WEEKLY") return "SEMANAL";
  if (c === "BIWEEKLY") return "QUINZENAL";
  if (c === "MONTHLY") return "MENSAL";
  return cycle;
};

export const generateConfissaoDividaV2HTML = (
  data: LegalDocumentParams & { templateId?: string },
  _docId?: string,
  _hash?: string,
  signatures: any[] = []
) => {
  const vm = buildConfissaoDividaVM(data);

  const findSig = (role: string) =>
    (signatures || []).find((s) => normalizeRole(safeRole(s)) === normalizeRole(role));

  const normalizeRole = (value: string | null | undefined) => {
      const role = String(value || "").trim().toUpperCase();
      if (role === "DEVEDOR" || role === "DEBTOR") return "DEBTOR";
      if (role === "CREDOR" || role === "CREDITOR") return "CREDITOR";
      if (role.startsWith("TESTEMUNHA_")) return role.replace("TESTEMUNHA_", "WITNESS_");
      if (role.startsWith("WITNESS_")) return role;
      if (role === "AVALISTA" || role === "GUARANTOR") return "AVALISTA";
      return role;
    };

  const safeRole = (sig: any): string => sig?.role || sig?.papel || "";

  const renderSignatureBlock = (role: string, name: string, doc: string) => {
    const sig = findSig(role);
    const displayRole = role.replace('DEBTOR', 'DEVEDOR').replace('CREDITOR', 'CREDOR').replace('WITNESS', 'TESTEMUNHA').replace('_', ' ');
    const isWitness = normalizeRole(role).startsWith('WITNESS_');
    const isMissing = (value: unknown) => {
      const normalized = String(value || '').trim().toLocaleLowerCase('pt-BR');
      return !normalized || normalized === '[preencher]' || normalized === FILL.toLocaleLowerCase('pt-BR');
    };
    const displayName = isMissing(name)
      ? (isWitness ? 'Testemunha a definir' : 'Não informado')
      : safeText(name);
    const displayCpf = isMissing(doc) ? 'A definir' : safeText(doc);

    let geoText = '';
    if (sig?.dispositivo_info) {
      try {
        const info = typeof sig.dispositivo_info === 'string' 
          ? JSON.parse(sig.dispositivo_info) 
          : sig.dispositivo_info;
        if (info && info.latitude && info.longitude) {
          geoText = ` • GEO: ${Number(info.latitude).toFixed(5)}, ${Number(info.longitude).toFixed(5)}`;
        }
      } catch (err) {
        console.warn("Erro ao fazer parse de dispositivo_info:", err);
      }
    }

    return `
      <div class="signature-block${sig ? ' is-signed' : ''}">
        ${sig ? `
            <div class="signature-proof">
                ${sig.assinatura_imagem ? `
                    <img class="signature-image" src="${sig.assinatura_imagem}" />
                ` : ''}
                <div class="signature-seal">
                    <span class="signature-seal-title">✓ ASSINATURA DIGITAL VÁLIDA</span><br/>
                    <span style="opacity: 0.8;">MP 2.200-2/2001 • DATA: ${new Date(sig.signed_at).toLocaleString('pt-BR')}</span><br/>
                    <span style="opacity: 0.8;">IP: ${sig.ip_origem || sig.ip || '---'}${geoText} • HASH: ${sig.assinatura_hash?.substring(0, 12).toUpperCase()}</span>
                </div>
            </div>
        ` : ''}
        <b class="signature-name">${displayName}</b>
        <span class="signature-role">${displayRole}</span>
        <small class="signature-cpf">CPF: ${displayCpf}</small>
      </div>
    `;
  };

  const totalDebtNumber = Number(data.totalDebt || data.amount || 0);
  const principalAmountNumber = Number(data.principalAmount ?? data.amount ?? 0);
  const originalPrincipalNumber = Number(data.originalPrincipalAmount ?? principalAmountNumber);
  const principalPaidNumber = Number(data.principalPaidAmount ?? Math.max(0, originalPrincipalNumber - principalAmountNumber));
  const legalInterestAmountNumber = Number(data.legalInterestAmount ?? Math.max(0, totalDebtNumber - principalAmountNumber));
  const legalInterestRatePercent = Number(data.legalInterestRatePercent || 0);
  const clauses = data.clauses || {};
  const includeCollectionClause = clauses.penhora !== false;
  const includeForumClause = clauses.foro !== false;
  const includeLateFine = clauses.multa !== false;
  const includeGuarantor = Boolean(
    data.incluirAvalista && clauses.avalista !== false && data.avalistaNome && data.avalistaCPF,
  );
  const configuredFinePercent = Math.max(0, Number(data.multaPercentual ?? 2));
  const contractReference = safeText(
    data.originDescription,
    `Contrato de origem nº ${safeText(data.codigo_contrato || data.loanId?.substring(0, 8)?.toUpperCase(), 'não informado')}.`,
  );
  const formatBRL = (value: number) => value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const valorExtenso = totalDebtNumber > 0 ? numberToWordsBRL(totalDebtNumber).trim().toUpperCase() : 'VALOR TOTAL CONTRATADO';

  const installments = Array.isArray(data.installments) ? data.installments : [];
  const installmentsCount = installments.length;

  let isSinglePayment = true;
  let cycleToUse = data.billingCycle || 'MONTHLY';
  const tId = data.templateId || 'CONFISSAO_AUTO';
  
  const isAgreement = data.isAgreement || tId === 'RENEGOCIACAO';

  if (tId === 'CONFISSAO_AUTO') {
      isSinglePayment = installmentsCount <= 1;
      cycleToUse = data.billingCycle || 'MONTHLY';
  } else if (tId === 'CONFISSAO_UNICO') {
      isSinglePayment = true;
  } else if (tId.includes('MENSAL') || tId.includes('QUINZENAL') || tId.includes('SEMANAL') || tId.includes('DIARIO')) {
      isSinglePayment = false;
      if (tId.includes('MENSAL')) cycleToUse = 'MONTHLY';
      if (tId.includes('QUINZENAL')) cycleToUse = 'BIWEEKLY';
      if (tId.includes('SEMANAL')) cycleToUse = 'WEEKLY';
      if (tId.includes('DIARIO')) cycleToUse = 'DAILY';
  }

  const cicloTraduzido = translateBillingCycle(cycleToUse);
  const valorFormatado = Number(totalDebtNumber).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  
  const contractDateRaw = data.contractDate || (data as any).startDate || (data as any).created_at || new Date().toISOString();
  const dataDisponibilizacao = safeDateBR(contractDateRaw);
  const tituloDocumento = isAgreement 
    ? "TERMO DE RENEGOCIAÇÃO E CONFISSÃO DE DÍVIDA"
    : "INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA";

  const primeiroVencimento = installmentsCount > 0 ? safeDateBR(installments[0].dueDate) : safeDateBR(new Date().toISOString());
  const vencimentoUnico = primeiroVencimento;
  const ultimoVencimento = installmentsCount > 0
    ? safeDateBR(installments[installments.length - 1].dueDate)
    : primeiroVencimento;

  const parcelamentoHTML = `
      <p class="indent">
          O débito confessado no valor total de <span class="bold">R$ ${valorFormatado} (${valorExtenso})</span> será quitado em <strong>${installmentsCount} parcelas</strong>, com periodicidade <strong>${cicloTraduzido}</strong>, conforme o cronograma abaixo.
      </p>
      <table class="payment-schedule">
        <thead><tr><th>Parcela</th><th>Vencimento</th><th>Valor</th></tr></thead>
        <tbody>
          ${installments.map((installment: any, index) => `
            <tr>
              <td>${Number(installment.number ?? index + 1)}</td>
              <td>${safeDateBR(installment.dueDate)}</td>
              <td>R$ ${formatBRL(Number(installment.amount || 0))}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <p class="schedule-summary">Primeiro vencimento: <strong>${primeiroVencimento}</strong> • Último vencimento: <strong>${ultimoVencimento}</strong>.</p>
  `;

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <style>
      @page { size: A4; margin: 18mm 20mm 20mm 24mm; }
      * { box-sizing: border-box; }
      html, body { background: #fff; }
      body {
        font-family: 'Times New Roman', Times, serif;
        line-height: 1.42;
        color: #252525;
        font-size: 10.5pt;
        text-align: justify;
        margin: 0;
        padding: 0;
      }
      .container { width: 100%; max-width: 166mm; margin: 0 auto; }
      .document-header { text-align: center; margin: 0 0 24px; page-break-after: avoid; }
      h1 {
        color: #151515;
        font-size: 14pt;
        line-height: 1.25;
        margin: 0;
        text-transform: uppercase;
        font-weight: 700;
        letter-spacing: 0.35px;
      }
      h2 {
        color: #1f1f1f;
        font-size: 10.5pt;
        line-height: 1.3;
        margin: 19px 0 8px;
        padding-bottom: 3px;
        text-transform: uppercase;
        font-weight: 700;
        border-bottom: 0.6pt solid #8a8a8a;
        page-break-after: avoid;
      }
      p { margin: 0 0 8px; orphans: 3; widows: 3; }
      ul { margin: 5px 0 10px 1.15cm; padding-left: 0.45cm; }
      li { margin-bottom: 4px; }
      .debt-summary {
        width: 100%;
        margin: 9px 0 12px;
        border-collapse: collapse;
        font-family: Arial, sans-serif;
        font-size: 8.5pt;
      }
      .debt-summary th, .debt-summary td { padding: 5px 7px; border: 0.6pt solid #777; }
      .debt-summary th { width: 62%; background: #f1f1f1; color: #111; text-align: left; }
      .debt-summary td { color: #050505; font-weight: 700; text-align: right; }
      .payment-schedule {
        width: 100%;
        margin: 8px 0 6px;
        border-collapse: collapse;
        font-family: Arial, sans-serif;
        font-size: 8pt;
        page-break-inside: auto;
      }
      .payment-schedule tr { page-break-inside: avoid; }
      .payment-schedule th, .payment-schedule td { padding: 4px 6px; border: 0.5pt solid #888; }
      .payment-schedule th { background: #f1f1f1; color: #111; text-transform: uppercase; }
      .payment-schedule th:first-child, .payment-schedule td:first-child { width: 18%; text-align: center; }
      .payment-schedule th:nth-child(2), .payment-schedule td:nth-child(2) { text-align: center; }
      .payment-schedule th:last-child, .payment-schedule td:last-child { text-align: right; }
      .schedule-summary { margin-top: 4px; font-size: 9pt; text-align: center; }
      .indent { text-indent: 1.25cm; }
      .bold { font-weight: bold; }
      .uppercase { text-transform: uppercase; }
      .execution-date { margin: 30px 0 0; text-align: center; page-break-after: avoid; }
      .signature-section { margin-top: 26px; }
      .signature-section-title {
        margin: 28px 0 0;
        color: #252525;
        font-size: 10pt;
        font-weight: 700;
        text-transform: uppercase;
        page-break-after: avoid;
      }
      .signatures-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        column-gap: 30px;
        row-gap: 24px;
        margin-top: 30px;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .signature-block {
        position: relative;
        min-width: 0;
        min-height: 50px;
        margin-top: 28px;
        padding: 6px 8px 0;
        border-top: 1pt solid #333;
        text-align: center;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .signature-block.is-signed { margin-top: 84px; }
      .signature-proof {
        position: absolute;
        bottom: calc(100% + 5px);
        left: 50%;
        width: 94%;
        transform: translateX(-50%);
        z-index: 1;
        pointer-events: none;
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .signature-image {
        display: block;
        max-height: 52px;
        max-width: 92%;
        object-fit: contain;
        margin-bottom: -8px;
        filter: contrast(150%) brightness(90%);
      }
      .signature-seal {
        max-width: 100%;
        padding: 4px 7px;
        border: 0.8pt solid #357a5b;
        border-left-width: 3px;
        border-radius: 3px;
        background: #f6fbf8;
        color: #2f6b50;
        font-family: Arial, sans-serif;
        font-size: 5.5pt;
        font-weight: 700;
        line-height: 1.25;
        text-align: center;
      }
      .signature-seal-title { font-size: 6.5pt; }
      .signature-name {
        display: block;
        overflow-wrap: anywhere;
        color: #050505;
        font-size: 9.5pt;
        font-weight: 700;
        line-height: 1.2;
        text-transform: uppercase;
      }
      .signature-role {
        display: block;
        margin-top: 3px;
        color: #171717;
        font-family: Arial, sans-serif;
        font-size: 7pt;
        font-weight: 700;
        letter-spacing: 0.35px;
        line-height: 1.15;
        text-transform: uppercase;
      }
      .signature-cpf {
        display: block;
        margin-top: 4px;
        color: #111;
        font-family: Arial, sans-serif;
        font-size: 7.5pt;
        font-weight: 700;
        line-height: 1.2;
      }
      @media screen and (max-width: 700px) {
        body { padding: 20px; }
        .container { max-width: none; }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <header class="document-header">
        <h1>${tituloDocumento}</h1>
      </header>

      <p><span class="bold">CREDOR(A):</span> <b>${safeText(vm.creditorName)}</b>, CPF/CNPJ nº <b>${safeText(vm.creditorDoc)}</b>, com endereço profissional/residencial na ${safeText(vm.creditorAddress)}.</p>
      
      <p><span class="bold">DEVEDOR(A):</span> <b>${safeText(vm.debtorName)}</b>, CPF/CNPJ nº <b>${safeText(vm.debtorDoc)}</b>, residente e domiciliado na ${safeText(vm.debtorAddress)}.</p>

      <p class="indent">As partes acima qualificadas, de livre e espontânea vontade, firmam o presente instrumento particular, que se regerá pelas cláusulas e condições seguintes:</p>

      <h2>CLÁUSULA PRIMEIRA - DO OBJETO E RECONHECIMENTO INCONDICIONAL DA DÍVIDA</h2>
      ${isAgreement ? `
        <p class="indent">A presente confissão decorre de ${contractReference} O(A) <strong>DEVEDOR(A)</strong> reconhece o saldo apurado após os pagamentos registrados e a reorganização formalizada em <strong>${safeDateBR(data.agreementDate)}</strong>.</p>
      ` : `
        <p class="indent">A presente confissão decorre de ${contractReference} O capital original foi disponibilizado em <strong>${dataDisponibilizacao}</strong>, e o(A) <strong>DEVEDOR(A)</strong> reconhece o saldo apurado após os pagamentos registrados.</p>
      `}
      <table class="debt-summary">
        <tbody>
          <tr><th>Capital originalmente disponibilizado</th><td>R$ ${formatBRL(originalPrincipalNumber)}</td></tr>
          <tr><th>Capital já pago e abatido</th><td>R$ ${formatBRL(principalPaidNumber)}</td></tr>
          <tr><th>Saldo de capital confessado</th><td>R$ ${formatBRL(principalAmountNumber)}</td></tr>
          ${legalInterestAmountNumber > 0 ? `<tr><th>Juros remuneratórios expressamente incluídos${legalInterestRatePercent > 0 ? ` (${formatBRL(legalInterestRatePercent)}%)` : ''}</th><td>R$ ${formatBRL(legalInterestAmountNumber)}</td></tr>` : ''}
          <tr><th>Valor total desta confissão</th><td>R$ ${valorFormatado}</td></tr>
        </tbody>
      </table>
      <p class="indent">O(A) <strong>DEVEDOR(A)</strong> confessa como obrigação certa e determinada o valor total de <span class="bold">R$ ${valorFormatado} (${valorExtenso})</span>, composto exclusivamente pelos itens acima. Pagamentos posteriores à emissão deverão ser abatidos do saldo exigível.</p>
      <p class="indent"><strong>PARÁGRAFO PRIMEIRO:</strong> Esta confissão confirma o saldo da obrigação de origem e <strong>não implica novação</strong>, salvo estipulação expressa em sentido contrário.</p>
      <p class="indent"><strong>PARÁGRAFO SEGUNDO:</strong> O reconhecimento do saldo não afasta direitos que não possam ser renunciados por instrumento particular nem autoriza cobrança em duplicidade.</p>

      <h2>CLÁUSULA SEGUNDA - DA FORMA E LOCAL DE PAGAMENTO</h2>
      ${isSinglePayment ? `
        <p class="indent">O valor confessado deverá ser pago em <strong>PARCELA ÚNICA</strong> de <span class="bold">R$ ${valorFormatado}</span>, com vencimento em <span class="bold">${vencimentoUnico}</span>.</p>
      ` : `
        <p class="indent">O pagamento do débito será realizado de forma <strong>PARCELADA</strong>, nos seguintes termos:</p>
        ${parcelamentoHTML}
      `}
      <p class="indent"><strong>FORMA DE PAGAMENTO:</strong> O pagamento deverá ser realizado pelo meio indicado pelo CREDOR. O comprovante identifica a transação, e a quitação será reconhecida na extensão do valor efetivamente recebido.</p>

      <h2>CLÁUSULA TERCEIRA - ${isSinglePayment ? 'DA MORA E DOS ENCARGOS MORATÓRIOS' : 'DO VENCIMENTO ANTECIPADO E DOS ENCARGOS MORATÓRIOS'}</h2>
      ${isSinglePayment ? `
        <p class="indent">O não pagamento da obrigação na data de vencimento constituirá o <strong>DEVEDOR</strong> em mora, passando a ser exigível o saldo de capital confessado, acrescido exclusivamente dos encargos previstos nesta cláusula.</p>
      ` : `
        <p class="indent">O não pagamento de qualquer parcela em seu vencimento poderá acarretar o <strong>VENCIMENTO ANTECIPADO DO SALDO REMANESCENTE</strong>, observados a legislação aplicável e os requisitos de constituição em mora.</p>
      `}
      <p class="indent">Sobre a obrigação vencida e não paga incidirão, a partir da mora, exclusivamente os seguintes encargos:</p>
      <ul>
        ${includeLateFine && configuredFinePercent > 0 ? `<li><strong>MULTA MORATÓRIA DE ${formatBRL(configuredFinePercent)}%</strong> sobre a prestação vencida e não paga;</li>` : ''}
        <li><strong>JUROS DE MORA PELA TAXA LEGAL</strong> prevista no art. 406 do Código Civil, calculados pro rata die conforme a metodologia oficial aplicável ao período;</li>
        <li><strong>ATUALIZAÇÃO MONETÁRIA</strong> pelo IPCA, ou pelo índice que legalmente o substituir, a partir do vencimento;</li>
        <li><strong>CUSTAS E HONORÁRIOS</strong> somente quando efetivamente devidos ou fixados na forma da legislação aplicável.</li>
      </ul>

      ${includeCollectionClause ? `
        <h2>CLÁUSULA QUARTA - DA COBRANÇA</h2>
        <p class="indent">Em caso de inadimplemento, o <strong>CREDOR</strong> poderá adotar as medidas extrajudiciais e judiciais legalmente cabíveis para cobrar o saldo efetivamente devido e os encargos previstos neste instrumento.</p>
      ` : ''}

      ${data.incluirGarantia ? `
        <h2>CLÁUSULA DE GARANTIA</h2>
        <p class="indent">Permanece vinculada à obrigação a garantia descrita no contrato de origem: <b>${safeText(data.descricaoGarantia)}</b>. Sua eventual execução observará o contrato de origem e o procedimento legal aplicável.</p>
      ` : ''}

      ${includeGuarantor ? `
        <h2>CLÁUSULA DE COOBRIGAÇÃO</h2>
        <p class="indent">O(A) Sr(a). <b>${safeText(data.avalistaNome)}</b>, CPF nº ${safeText(data.avalistaCPF)}, assina este instrumento como AVALISTA E PRINCIPAL PAGADOR, assumindo responsabilidade <strong>SOLIDÁRIA</strong> por toda a dívida, renunciando ao benefício de ordem previsto no Art. 827 do Código Civil.</p>
      ` : ''}

      <h2>CLÁUSULA FINAL - DA TOLERÂNCIA${includeForumClause ? ' E DO FORO' : ''}</h2>
      <p class="indent">A eventual tolerância quanto a atraso ou descumprimento não altera as condições deste instrumento nem representa renúncia ao direito correspondente.${includeForumClause ? ` Fica eleito o Foro da Comarca de <b>${safeText(vm.city)}</b>, ressalvado eventual foro legalmente competente que não possa ser afastado por convenção.` : ''}</p>

      <p class="execution-date"><span class="uppercase">${safeText(vm.city)}</span>, <span class="bold">${vm.date}</span>.</p>

      <section class="signature-section">
        <div class="signatures-grid">
          ${renderSignatureBlock("CREDOR", safeText(vm.creditorName), safeText(vm.creditorDoc))}
          ${renderSignatureBlock("DEVEDOR", safeText(vm.debtorName), safeText(vm.debtorDoc))}
          ${includeGuarantor ? renderSignatureBlock("AVALISTA", safeText(data.avalistaNome), safeText(data.avalistaCPF)) : ""}
        </div>

        <p class="signature-section-title">Testemunhas instrumentárias</p>
        <div class="signatures-grid">
          ${renderSignatureBlock("TESTEMUNHA_1", safeText(data.witnesses?.[0]?.name), safeText((data.witnesses?.[0] as any)?.document || (data.witnesses?.[0] as any)?.documento))}
          ${renderSignatureBlock("TESTEMUNHA_2", safeText(data.witnesses?.[1]?.name), safeText((data.witnesses?.[1] as any)?.document || (data.witnesses?.[1] as any)?.documento))}
        </div>
      </section>
    </div>
  </body>
  </html>
  `;
};
