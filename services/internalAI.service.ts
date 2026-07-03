type InternalAIContext = Record<string, any> | null | undefined;

type InternalAIResponse = {
  ok?: boolean;
  intent: string;
  feedback: string;
  analysis?: string;
  data?: any;
  suggestions?: string[];
  riskScore?: number;
};

const n = (value: any) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));

const money = (value: any) =>
  n(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const normalize = (value: any) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

function resolveMetrics(context: InternalAIContext) {
  const ctx = context || {};
  const flow = ctx.monthFlow || ctx.cashFlow || {};
  const portfolio = Array.isArray(ctx.portfolioHealth) ? ctx.portfolioHealth : [];
  const topLateLoans = Array.isArray(ctx.topLateLoans) ? ctx.topLateLoans : [];
  const totalLent = n(ctx.totalLent ?? ctx.total_lent ?? ctx.principalOpen);
  const interestBalance = n(ctx.interestBalance ?? ctx.profitBalance ?? ctx.caixaLivre);
  const sourceLiquidity = n(ctx.sourceLiquidity ?? ctx.liquidity ?? ctx.cash);
  const lateCount = n(ctx.lateCount ?? ctx.overdueCount ?? topLateLoans.length);
  const activeCount = n(ctx.activeCount ?? portfolio.filter((p: any) => normalize(p?.status) === 'active').length ?? portfolio.length);
  const monthIn = n(flow.in ?? flow.entrada ?? flow.receitas);
  const monthOut = n(flow.out ?? flow.saida ?? flow.despesas);
  const netFlow = monthIn - monthOut;
  const latePressure = activeCount > 0 ? lateCount / activeCount : lateCount > 0 ? 1 : 0;
  const liquidityPressure = totalLent > 0 ? Math.min(1, Math.max(0, (totalLent - sourceLiquidity) / totalLent)) : 0;
  const flowPenalty = netFlow < 0 ? Math.min(18, Math.abs(netFlow) / Math.max(1, totalLent) * 100) : 0;
  const score = clamp(Math.round(92 - latePressure * 38 - liquidityPressure * 18 - flowPenalty + Math.min(8, interestBalance / Math.max(1, totalLent) * 100)));

  return {
    totalLent,
    interestBalance,
    sourceLiquidity,
    lateCount,
    activeCount,
    topLateLoans,
    monthIn,
    monthOut,
    netFlow,
    score,
  };
}

function resolveRiskLabel(score: number, lateCount: number) {
  if (lateCount > 0 && score < 55) return 'RISCO ALTO';
  if (lateCount > 0 || score < 72) return 'ATENÇÃO';
  if (score >= 85) return 'SAUDÁVEL';
  return 'CONTROLADO';
}

function buildPortfolioAnalysis(context: InternalAIContext, source: 'LOCAL' | 'FALLBACK' = 'LOCAL'): InternalAIResponse {
  const metrics = resolveMetrics(context);
  const label = resolveRiskLabel(metrics.score, metrics.lateCount);
  const topLate = metrics.topLateLoans
    .slice(0, 3)
    .map((item: any) => `${item.name || 'Cliente'} (${money(item.amount)}, ${n(item.days)} dia(s))`)
    .join('; ');

  const analysis = [
    `Leitura interna CapitalFlow: carteira com ${metrics.activeCount || 'sem'} contrato(s) ativo(s), capital em aberto de ${money(metrics.totalLent)} e ${metrics.lateCount} contrato(s) em atraso.`,
    `Caixa/lucro disponível identificado: ${money(metrics.interestBalance)}. Fluxo do mês: entradas de ${money(metrics.monthIn)}, saídas de ${money(metrics.monthOut)}, saldo operacional de ${money(metrics.netFlow)}.`,
    topLate ? `Prioridade de cobrança: ${topLate}.` : 'Não há concentração crítica de atraso nos dados recebidos.',
    source === 'FALLBACK' ? 'A análise foi gerada pelo motor interno porque a IA externa não está configurada ou falhou.' : 'A análise foi gerada pelo motor interno do sistema.',
  ].join('\n');

  const suggestions = metrics.lateCount > 0
    ? ['Priorizar maiores atrasos', 'Confirmar próximos vencimentos', 'Registrar promessa de pagamento', 'Evitar novo crédito para inadimplentes']
    : ['Manter agenda de cobrança preventiva', 'Conferir caixa livre antes de novos contratos', 'Monitorar parcelas próximas'];

  return {
    ok: true,
    intent: label,
    feedback: `${label}: score interno ${metrics.score}/100. ${metrics.lateCount > 0 ? 'Há cobrança prioritária.' : 'Carteira sem alerta crítico nos dados atuais.'}`,
    analysis,
    suggestions,
    riskScore: metrics.score,
  };
}

function extractAmount(text: string) {
  const match = text.match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:[.,]\d{1,2})?)/i);
  if (!match) return 0;
  return Number(match[1].replace(/\./g, '').replace(',', '.')) || 0;
}

function extractNameAfter(text: string, markers: string[]) {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  const lower = normalize(cleaned);
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx >= 0) {
      const raw = cleaned.slice(idx + marker.length).replace(/\b(r\$|valor|recebeu|pagou|pagar|receber)\b.*$/i, '').trim();
      if (raw) return raw.split(' ').slice(0, 4).join(' ');
    }
  }
  return '';
}

export function processInternalAICommand(text: string, context: InternalAIContext): InternalAIResponse {
  const normalized = normalize(text);

  if (/\b(cadastrar|cadastre|novo cliente|cliente novo)\b/.test(normalized)) {
    const name = extractNameAfter(text, ['cliente ', 'cadastrar ', 'cadastre ']);
    const phone = (text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/) || [''])[0];
    return {
      ok: true,
      intent: 'REGISTER_CLIENT',
      feedback: name ? `Cliente ${name} preparado para cadastro.` : 'Preparei o cadastro do cliente com os dados identificados.',
      analysis: 'Comando operacional identificado pelo motor interno.',
      data: { name, phone },
      suggestions: ['Conferir nome', 'Preencher documento manualmente', 'Salvar cadastro'],
      riskScore: 80,
    };
  }

  if (/\b(recebi|recebeu|recebimento|pagou|pagamento|pagar|baixar parcela)\b/.test(normalized)) {
    const amount = extractAmount(text);
    const name = extractNameAfter(text, ['de ', 'do ', 'da ', 'cliente ']);
    return {
      ok: true,
      intent: 'REGISTER_PAYMENT',
      feedback: amount > 0 ? `Recebimento de ${money(amount)} identificado.` : 'Recebimento identificado. Confira o contrato antes de confirmar.',
      analysis: 'O motor interno abriu o fluxo operacional para registrar recebimento sem depender de IA externa.',
      data: { name, amount },
      suggestions: ['Conferir cliente', 'Confirmar valor recebido', 'Gerar comprovante'],
      riskScore: 82,
    };
  }

  if (/\b(lembrete|agenda|agendar|cobrar em|me avise)\b/.test(normalized)) {
    return {
      ok: true,
      intent: 'ADD_REMINDER',
      feedback: 'Lembrete identificado e pronto para registro.',
      analysis: 'Comando de agenda identificado localmente.',
      data: { description: text, date: new Date().toISOString().split('T')[0] },
      suggestions: ['Conferir data', 'Salvar lembrete'],
      riskScore: 78,
    };
  }

  return buildPortfolioAnalysis(context);
}

export function buildInternalAIText(prompt: string, context?: InternalAIContext) {
  const analysis = buildPortfolioAnalysis(context || { type: 'TEXT_PROMPT' }, 'FALLBACK');
  return [
    analysis.feedback,
    '',
    analysis.analysis,
    '',
    'Ações sugeridas:',
    ...(analysis.suggestions || []).map((item) => `- ${item}`),
    '',
    `Pergunta recebida: ${prompt}`,
  ].join('\n');
}

export function buildInternalExtratoResponse(action: string, context: InternalAIContext, userQuestion?: string) {
  const ctx = context || {};
  const totals = ctx.totals || ctx.summary || ctx;
  const entradas = n(totals.income ?? totals.entradas ?? totals.receitas ?? totals.totalReceitas);
  const saidas = n(totals.expense ?? totals.saidas ?? totals.despesas ?? totals.totalDespesas);
  const saldo = n(totals.balance ?? totals.saldo ?? entradas - saidas);
  const direction = saldo >= 0 ? 'positivo' : 'negativo';

  return [
    `Análise interna do extrato (${action || 'consulta'}).`,
    `Resultado do período: entradas ${money(entradas)}, saídas ${money(saidas)} e saldo ${direction} de ${money(saldo)}.`,
    saldo < 0
      ? 'Ponto de atenção: as saídas superaram as entradas. Revise retiradas, aportes e pagamentos antes de assumir novos compromissos.'
      : 'Leitura operacional: o período está com saldo favorável. Ainda assim, confirme se esse saldo está livre para saque ou comprometido com parcelas futuras.',
    userQuestion ? `Pergunta considerada: ${userQuestion}` : 'Sugestão: use esta leitura como apoio e confirme os lançamentos no histórico antes de decidir.',
  ].join('\n');
}

export function buildLegalConfessionFallback(agreement: any, loan: any, activeUser: any, options: any) {
  const installments = Array.isArray(agreement?.installments) ? agreement.installments : [];
  const totalDebt = n(agreement?.negotiatedTotal ?? agreement?.totalDebtAtNegotiation ?? loan?.totalToReceive ?? loan?.principal);
  const missing: string[] = [];
  const debtorName = loan?.debtorName || loan?.clientName || '[PREENCHER]';
  const creditorName = activeUser?.name || activeUser?.fullName || '[PREENCHER]';

  if (debtorName === '[PREENCHER]') missing.push('debtorName');
  if (creditorName === '[PREENCHER]') missing.push('creditorName');
  if (!activeUser?.document) missing.push('creditorDoc');
  if (!loan?.debtorDoc && !loan?.clientDocument) missing.push('debtorDoc');

  return {
    loanId: loan?.id || agreement?.loan_id || '',
    codigo_contrato: loan?.contractCode || loan?.id?.slice?.(0, 8) || '',
    clientName: debtorName,
    debtorName,
    debtorDoc: loan?.debtorDoc || loan?.clientDocument || '[PREENCHER]',
    debtorPhone: loan?.debtorPhone || loan?.clientPhone || '',
    debtorAddress: loan?.debtorAddress || loan?.clientAddress || '[PREENCHER]',
    creditorName,
    creditorDoc: activeUser?.document || activeUser?.cpf || activeUser?.cnpj || '[PREENCHER]',
    creditorAddress: activeUser?.address || '[PREENCHER]',
    amount: totalDebt,
    totalDebt,
    originDescription: 'Confissão de dívida gerada pelo motor interno do CapitalFlow a partir dos dados do contrato e da renegociação.',
    city: activeUser?.city || options?.city || '[PREENCHER]',
    state: activeUser?.state || options?.state || '[PREENCHER]',
    witnesses: options?.witnesses || [],
    contractDate: loan?.startDate || new Date().toISOString().split('T')[0],
    agreementDate: agreement?.createdAt || agreement?.created_at || new Date().toISOString(),
    installments,
    timestamp: new Date().toISOString(),
    discount: n(agreement?.discount || options?.discount),
    gracePeriod: n(options?.gracePeriod),
    downPayment: n(options?.downPayment),
    incluirGarantia: Boolean(options?.incluirGarantia),
    tipoGarantia: options?.tipoGarantia || '',
    descricaoGarantia: options?.descricaoGarantia || '',
    incluirPenhoraAutomatica: Boolean(options?.incluirPenhoraAutomatica),
    incluirAvalista: Boolean(options?.incluirAvalista),
    avalistaNome: options?.avalistaNome || '',
    avalistaCPF: options?.avalistaCPF || '',
    avalistaEndereco: options?.avalistaEndereco || '',
    multaPercentual: n(options?.multaPercentual ?? loan?.lateFeeRate),
    jurosMensal: n(options?.jurosMensal ?? loan?.interestRate),
    honorariosPercentual: n(options?.honorariosPercentual),
    billingCycle: loan?.billingCycle,
    amortizationType: loan?.amortizationType,
    isAgreement: true,
    contractDurationDays: n(options?.contractDurationDays),
    templateId: options?.templateId || 'CONFISSAO',
    campos_faltantes: missing,
  };
}
