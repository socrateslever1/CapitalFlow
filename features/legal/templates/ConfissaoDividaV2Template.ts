import { LegalDocumentParams } from "../../../types";
import { numberToWordsBRL, formatMoney } from "../../../utils/formatters";
import { buildConfissaoDividaVM } from "../viewModels/confissaoVM";

const FILL = "[PREENCHER]";

const safeText = (value: unknown): string => {
  if (value === null || value === undefined) return FILL;
  const text = String(value).trim();
  return text.length > 0 ? text : FILL;
};

const safeDateBR = (value: unknown): string => {
  if (!value) return FILL;
  if (String(value).includes(' de ')) return String(value);
  
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? FILL : date.toLocaleDateString("pt-BR");
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
  docId?: string,
  hash?: string,
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

    return `
      <div style="text-align: center; border-top: 1.5pt solid #000; padding-top: 10px; position: relative; page-break-inside: avoid; margin-top: 60px; min-height: 80px;">
        ${sig ? `
            <div style="position: absolute; top: -85px; left: 50%; transform: translateX(-50%); width: 90%; z-index: 10; pointer-events: none; display: flex; flex-direction: column; align-items: center;">
                ${sig.assinatura_imagem ? `
                    <img src="${sig.assinatura_imagem}" style="max-height: 70px; max-width: 100%; object-fit: contain; margin-bottom: -15px; filter: contrast(150%) brightness(90%);" />
                ` : ''}
                <div style="border: 1px solid #059669; color: #059669; padding: 6px 10px; font-family: sans-serif; font-size: 6pt; font-weight: bold; background: rgba(236, 253, 245, 0.95); border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); line-height: 1.3; text-align: center; border-left: 4px solid #059669;">
                    <span style="font-size: 7pt;">✓ ASSINATURA DIGITAL VÁLIDA</span><br/>
                    <span style="opacity: 0.8;">MP 2.200-2/2001 • DATA: ${new Date(sig.signed_at).toLocaleString('pt-BR')}</span><br/>
                    <span style="opacity: 0.8;">IP: ${sig.ip_origem} • HASH: ${sig.assinatura_hash?.substring(0, 12).toUpperCase()}</span>
                </div>
            </div>
        ` : ''}
        <b style="text-transform: uppercase; font-size: 11pt; display: block; margin-bottom: 2px;">${safeText(name)}</b>
        <span style="font-size: 9pt; color: #444; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">${displayRole}</span><br/>
        <small style="font-size: 8pt; color: #666;">DOC: ${safeText(doc)}</small>
      </div>
    `;
  };

  const totalDebtNumber = Number(data.totalDebt || data.amount || 0);
  const valorExtenso = totalDebtNumber > 0 ? numberToWordsBRL(totalDebtNumber).toUpperCase() : FILL;

  const multa = data.multaPercentual || 10;
  const juros = data.jurosMensal || 1;
  const honorarios = data.honorariosPercentual || 20;

  const installments = Array.isArray(data.installments) ? data.installments : [];
  const installmentsCount = installments.length;

  let isSinglePayment = true;
  let cycleToUse = data.billingCycle || 'MONTHLY';
  const tId = data.templateId || 'CONFISSAO_AUTO';
  
  // Se for um Acordo, força identificação de Acordo, mesmo que o template selecionado seja 'Auto'
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
  const durationDays = data.contractDurationDays || 30;

  // Títulos
  const tituloDocumento = isAgreement 
    ? "TERMO DE RENEGOCIAÇÃO E CONFISSÃO DE DÍVIDA"
    : "INSTRUMENTO PARTICULAR DE CONFISSÃO DE DÍVIDA E PROMESSA DE PAGAMENTO";
    
  const subtituloDocumento = "TÍTULO EXECUTIVO EXTRAJUDICIAL - ART. 784, III DO CPC/2015";
  
  const modalidadeTexto = isSinglePayment 
    ? `PAGAMENTO ÚNICO - PRAZO DE ${durationDays} DIAS` 
    : `PAGAMENTO PARCELADO - CICLO ${cicloTraduzido} (${installmentsCount > 0 ? installmentsCount : 'X'} PARCELAS)`;

  let parcelamentoHTML = "";
  if (!isSinglePayment) {
    const installmentValue = installmentsCount > 0 ? Number(installments[0].amount) : 0;
    const installmentValueFormatado = installmentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const primeiroVencimento = installmentsCount > 0 ? safeDateBR(installments[0].dueDate) : FILL;
    const extensoValorParcela = installmentValue > 0 ? numberToWordsBRL(installmentValue).toUpperCase() : FILL;
    
    parcelamentoHTML = `
        <p class="indent" style="margin-top: 15px;">
            O débito será quitado em <strong>${installmentsCount > 0 ? installmentsCount : 'X'} (${installmentsCount > 0 ? numberToWordsBRL(installmentsCount).replace(' reais', '').toUpperCase() : FILL}) parcelas</strong> fixas e sucessivas, 
            no valor individual de <strong>R$ ${installmentValueFormatado} (${extensoValorParcela})</strong>, com periodicidade <strong>${cicloTraduzido}</strong>. 
            O vencimento da primeira parcela ocorrerá impreterivelmente em <strong>${primeiroVencimento}</strong>, e as demais seguirão o ciclo estabelecido até a quitação integral do saldo devedor de R$ ${valorFormatado}.
        </p>
    `;
  }

  const vencimentoUnico = installments[0]?.dueDate ? safeDateBR(installments[0].dueDate) : FILL;

  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <style>
      @page { size: A4; margin: 2.5cm 2.5cm 2.5cm 3cm; }
      body { font-family: 'Times New Roman', Times, serif; line-height: 1.5; color: #000; font-size: 11pt; text-align: justify; margin: 0; padding: 0; }
      .container { max-width: 800px; margin: auto; }
      .header-box { text-align: center; border: 2.5pt solid #000; padding: 20px; margin-bottom: 35px; }
      h1 { font-size: 14pt; margin: 0; text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; }
      h2 { font-size: 11pt; margin: 25px 0 12px 0; text-transform: uppercase; font-weight: bold; border-left: 4pt solid #000; padding-left: 10px; }
      .signatures-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 60px; page-break-inside: avoid; }
      .indent { text-indent: 1.5cm; margin-bottom: 10px; }
      .bold { font-weight: bold; }
      .uppercase { text-transform: uppercase; }
      .nota-promissoria { margin-top: 100px; border: 5pt double #000; padding: 35px; page-break-before: always; position: relative; background: #fff; }
      .np-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2.5pt solid #000; padding-bottom: 12px; margin-bottom: 25px; }
      .np-title { font-size: 20pt; font-weight: bold; letter-spacing: 2px; }
      .np-value { font-size: 18pt; font-weight: bold; border: 2pt solid #000; padding: 8px 20px; background: #f0f0f0; }
      .np-body { font-size: 12pt; line-height: 1.6; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header-box">
        <h1>${tituloDocumento}</h1>
        <div style="font-size: 10pt; font-weight: bold; margin-top: 8px; text-transform: uppercase;">${subtituloDocumento}</div>
        <div style="font-size: 10pt; margin-top: 4px; color: #000; font-weight: bold;">MODALIDADE: ${modalidadeTexto}</div>
      </div>

      <p><span class="bold">CREDOR(A):</span> <b>${safeText(vm.creditorName)}</b>, CPF/CNPJ nº <b>${safeText(vm.creditorDoc)}</b>, com endereço profissional/residencial na ${safeText(vm.creditorAddress)}.</p>
      
      <p><span class="bold">DEVEDOR(A):</span> <b>${safeText(vm.debtorName)}</b>, CPF/CNPJ nº <b>${safeText(vm.debtorDoc)}</b>, residente e domiciliado na ${safeText(vm.debtorAddress)}.</p>

      <p class="indent">As partes acima qualificadas, de livre e espontânea vontade, firmam o presente <strong>Título Executivo Extrajudicial</strong>, que se regerá pelas cláusulas e condições seguintes:</p>

      <h2>CLÁUSULA PRIMEIRA - DO OBJETO E RECONHECIMENTO INCONDICIONAL DA DÍVIDA</h2>
      ${isAgreement ? `
        <p class="indent">O(A) <strong>DEVEDOR(A)</strong>, por este instrumento, reconhece e confessa ser devedor(a) ao <strong>CREDOR</strong> da quantia líquida, certa e exigível de <span class="bold">R$ ${valorFormatado} (${valorExtenso})</span>, referente à <strong>RENEGOCIAÇÃO</strong> do contrato de mútuo financeiro original, cujas condições primitivas ficam integralmente substituídas pelas ora estipuladas.</p>
      ` : `
        <p class="indent">O(A) <strong>DEVEDOR(A)</strong>, por este instrumento, reconhece e confessa ser devedor(a) ao <strong>CREDOR</strong> da quantia líquida, certa e exigível de <span class="bold">R$ ${valorFormatado} (${valorExtenso})</span>, referente a transações comerciais/financeiras anteriormente realizadas e aqui consolidadas.</p>
      `}
      <p class="indent"><strong>PARÁGRAFO PRIMEIRO:</strong> A presente confissão é feita em caráter <strong>IRREVOGÁVEL E IRRETRATÁVEL</strong>, obrigando o devedor, seus herdeiros e sucessores ao fiel cumprimento de todas as obrigações aqui assumidas.</p>
      <p class="indent"><strong>PARÁGRAFO SEGUNDO:</strong> O <strong>DEVEDOR</strong> renuncia expressamente a qualquer discussão sobre a origem da dívida, reconhecendo que o presente título preenche todos os requisitos legais para execução imediata.</p>

      <h2>CLÁUSULA SEGUNDA - DA FORMA E LOCAL DE PAGAMENTO</h2>
      ${isSinglePayment ? `
        <p class="indent">O pagamento integral da dívida, referente ao período de <strong>${durationDays} dias</strong> de operação, deverá ser realizado em uma <strong>ÚNICA PARCELA</strong> no valor de <span class="bold">R$ ${valorFormatado}</span>, com vencimento improrrogável em <span class="bold">${vencimentoUnico}</span>.</p>
      ` : `
        <p class="indent">O pagamento do débito será realizado de forma <strong>PARCELADA</strong>, nos seguintes termos:</p>
        ${parcelamentoHTML}
      `}
      <p class="indent"><strong>FORMA DE QUITAÇÃO:</strong> O pagamento deverá ser realizado via transferência bancária ou PIX para a chave informada pelo CREDOR. O comprovante de transação bancária servirá como recibo de quitação da respectiva parcela.</p>

      <h2>CLÁUSULA TERCEIRA - DO VENCIMENTO ANTECIPADO E ENCARGOS MORATÓRIOS</h2>
      <p class="indent">O não pagamento de qualquer das parcelas em seu respectivo vencimento implicará no <strong>VENCIMENTO ANTECIPADO DE TODA A DÍVIDA</strong>, independentemente de notificação judicial ou extrajudicial.</p>
      <p class="indent">Sobre o valor total em aberto, incidirão os seguintes encargos:</p>
      <ul style="margin-left: 2cm;">
        <li><strong>MULTA PENAL DE ${multa}%</strong> sobre o saldo devedor atualizado;</li>
        <li><strong>JUROS DE MORA DE ${juros}% AO MÊS</strong>, calculados pro rata die;</li>
        <li><strong>HONORÁRIOS ADVOCATÍCIOS DE ${honorarios}%</strong> em caso de necessidade de intervenção profissional para cobrança, seja amigável ou judicial.</li>
      </ul>

      <h2>CLÁUSULA QUARTA - DAS MEDIDAS COERCITIVAS E GARANTIA PATRIMONIAL</h2>
      <p class="indent">O <strong>DEVEDOR</strong> declara estar ciente de que responde pelo cumprimento desta obrigação com <strong>TODOS OS SEUS BENS PRESENTES E FUTUROS</strong> (Art. 789 do CPC). Fica o CREDOR expressamente autorizado a:</p>
      <p class="indent">
        a) Inserir o nome do devedor nos cadastros de inadimplentes (SPC/SERASA);<br/>
        b) Requerer judicialmente a penhora online de ativos financeiros (SISBAJUD) e restrição de veículos (RENAJUD);<br/>
        c) Proceder com o arresto de bens suficientes à satisfação do crédito.
      </p>

      ${data.incluirGarantia ? `
        <h2>CLÁUSULA QUINTA - DA GARANTIA ESPECÍFICA</h2>
        <p class="indent">Para assegurar o pagamento, o DEVEDOR oferece em garantia o seguinte bem: <b>${safeText(data.tipoGarantia)} - ${safeText(data.descricaoGarantia)}</b>, o qual poderá ser objeto de busca e apreensão ou penhora imediata em caso de mora.</p>
      ` : ''}

      ${data.incluirAvalista ? `
        <h2>CLÁUSULA SEXTA - DO AVALISTA / FIADOR SOLIDÁRIO</h2>
        <p class="indent">O(A) Sr(a). <b>${safeText(data.avalistaNome)}</b>, CPF nº ${safeText(data.avalistaCPF)}, assina este instrumento como AVALISTA E PRINCIPAL PAGADOR, assumindo responsabilidade <strong>SOLIDÁRIA</strong> por toda a dívida, renunciando ao benefício de ordem previsto no Art. 827 do Código Civil.</p>
      ` : ''}

      <h2>CLÁUSULA SÉTIMA - DA TOLERÂNCIA E FORO</h2>
      <p class="indent">A eventual tolerância do CREDOR em relação a atrasos não constituirá novação contratual, sendo mera liberalidade. As partes elegem o Foro da Comarca de <b>${safeText(vm.city)}</b> para dirimir quaisquer dúvidas deste contrato.</p>

      <p style="margin-top: 50px; text-align: center;"><span class="uppercase">${safeText(vm.city)}</span>, <span class="bold">${vm.date}</span>.</p>

      <div class="signatures-grid">
        ${renderSignatureBlock("CREDOR", safeText(vm.creditorName), safeText(vm.creditorDoc))}
        ${renderSignatureBlock("DEVEDOR", safeText(vm.debtorName), safeText(vm.debtorDoc))}
        ${data.incluirAvalista ? renderSignatureBlock("AVALISTA", safeText(data.avalistaNome), safeText(data.avalistaCPF)) : ""}
      </div>

      <p style="margin-top: 50px; font-weight: bold; text-decoration: underline;">TESTEMUNHAS INSTRUMENTÁRIAS:</p>
      <div class="signatures-grid">
        ${renderSignatureBlock("TESTEMUNHA_1", safeText(data.witnesses?.[0]?.name), safeText((data.witnesses?.[0] as any)?.document || (data.witnesses?.[0] as any)?.documento))}
        ${renderSignatureBlock("TESTEMUNHA_2", safeText(data.witnesses?.[1]?.name), safeText((data.witnesses?.[1] as any)?.document || (data.witnesses?.[1] as any)?.documento))}
      </div>

      <div style="margin-top: 100px; padding-top: 20px; border-top: 1pt solid #ddd; font-family: sans-serif; font-size: 8pt; color: #777; display: flex; justify-content: space-between; align-items: flex-end;">
        <div style="flex: 1;">
            <strong>CapitalFlow Compliance System:</strong><br/>
            ID REGISTRO: <code>${docId || 'PENDENTE'}</code> | HASH DE SEGURANÇA: <b>${hash?.toUpperCase() || 'AGUARDANDO_ASSINATURA'}</b><br/>
            Este documento possui validade jurídica plena conforme MP 2.200-2/2001.
        </div>
      </div>

      <div class="nota-promissoria">
        <div class="np-header">
          <div class="np-title">NOTA PROMISSÓRIA</div>
          <div class="np-value">R$ ${valorFormatado}</div>
        </div>

        <div class="np-body">
          <p>Ao(s) <span class="bold">${vencimentoUnico}</span>, pagarei por esta única via de Nota Promissória a <span class="bold">${safeText(vm.creditorName)}</span>, CPF/CNPJ nº ${safeText(vm.creditorDoc)}, ou à sua ordem, a quantia de <span class="bold">R$ ${valorFormatado} (${valorExtenso})</span>, pagável em <span class="bold">${safeText(vm.city)}</span>.</p>
          <p style="margin-top: 20px;">
            <span class="bold">EMITENTE (DEVEDOR):</span> ${safeText(vm.debtorName)}<br/>
            <span class="bold">CPF/CNPJ:</span> ${safeText(vm.debtorDoc)}<br/>
            <span class="bold">ENDEREÇO:</span> ${safeText(vm.debtorAddress)}
          </p>
        </div>

        <div style="margin-top: 60px; border-top: 2pt solid #000; width: 70%; text-align: center; padding-top: 8px; font-weight: bold; text-transform: uppercase; font-size: 11pt;">
          Assinatura do Emitente (Devedor)
        </div>
        
        <div style="position: absolute; bottom: 10px; right: 10px; font-size: 7pt; color: #aaa;">Vínculo: Confissão de Dívida ID ${docId?.substring(0,8) || '---'}</div>
      </div>
    </div>
  </body>
  </html>
  `;
};
