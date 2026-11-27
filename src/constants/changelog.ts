export type ChangelogEntryKind = 'NOVIDADE' | 'MELHORIA' | 'CORRECAO';

export interface ChangelogItem {
  kind: ChangelogEntryKind;
  text: string;
}

export interface ChangelogRelease {
  version: string;
  /** Commit de alteração de código; não representa, por si só, uma release assinada. */
  commit?: string;
  codeOnly?: boolean;
  date: string;
  title: string;
  summary: string;
  items: ChangelogItem[];
}

/**
 * Registro oficial de atualizações exibido na área de Perfil.
 * Adicionar as atualizações mais recentes no topo, mesmo sem nova versão numerada.
 */
export const SYSTEM_CHANGELOG: ChangelogRelease[] = [
  {
    version: '3.7.1',
    codeOnly: true,
    date: '27/11/2026',
    title: 'Aviso de fatura no celular',
    summary: 'O celular avisa quando a fatura de um cartão vai fechar ou vencer nos próximos 3 dias.',
    items: [
      { kind: 'NOVIDADE', text: 'Notificação no celular, todo dia às 8h, quando a fatura vai fechar ou vencer, sem mostrar valores.' },
    ],
  },
  {
    version: '3.7.0',
    codeOnly: true,
    date: '27/11/2026',
    title: 'Somar contratos mantendo os juros',
    summary: 'Una contratos mensais do mesmo cliente num só, continuando a cobrança normal de juros.',
    items: [
      { kind: 'NOVIDADE', text: 'Na unificação, escolha "Somar contratos e manter os juros": o principal é somado e os juros continuam todo mês.' },
    ],
  },
  {
    version: '3.6.5',
    codeOnly: true,
    date: '27/11/2026',
    title: 'Regra do cartão em toda a Carteira',
    summary: 'Importação de fatura e linha do tempo seguem a regra de fechamento de cada cartão, e telas sem termos técnicos.',
    items: [
      { kind: 'MELHORIA', text: 'Importar fatura e a linha do tempo usam o fechamento e o vencimento configurados em cada cartão.' },
      { kind: 'MELHORIA', text: 'Saldo inicial virou um botão simples, sem texto técnico.' },
    ],
  },
  {
    version: '3.6.4',
    codeOnly: true,
    date: '27/11/2026',
    title: 'Logos dos bancos',
    summary: 'Os logos dos bancos agora preenchem o quadro e aparecem bem no tema escuro.',
    items: [
      { kind: 'MELHORIA', text: 'Logos de bancos maiores e centralizados nas contas e nos cartões; o C6 e o Nubank ficam visíveis no fundo escuro.' },
    ],
  },
  {
    version: '3.6.3',
    codeOnly: true,
    date: '27/11/2026',
    title: 'Excluir vários e notificações',
    summary: 'Selecione vários lançamentos da fatura para excluir, e as notificações mostram o banco ou o cliente.',
    items: [
      { kind: 'NOVIDADE', text: 'No extrato da fatura, toque em Selecionar para excluir vários lançamentos de uma vez.' },
      { kind: 'MELHORIA', text: 'Notificações mostram o logo do banco, a foto do cliente e uma cor para cada tipo de aviso.' },
      { kind: 'CORRECAO', text: 'O aviso de fatura não aparece mais repetido.' },
    ],
  },
  {
    version: '3.6.2',
    codeOnly: true,
    date: '27/11/2026',
    title: 'Tela da conta mais limpa',
    summary: 'Botão Pendente nas ações da conta e dados do titular só em Editar conta.',
    items: [
      { kind: 'MELHORIA', text: 'O lançamento pendente agora tem botão próprio nas ações da conta; a lista só aparece quando há pendências.' },
      { kind: 'MELHORIA', text: 'Nome, CPF e dados bancários do titular saíram da tela principal e ficam em Editar conta.' },
    ],
  },
  {
    version: '3.6.1',
    codeOnly: true,
    date: '27/11/2026',
    title: 'Excluir apaga de verdade',
    summary: 'Lançamento inserido por engano agora é apagado do registro ao ser excluído.',
    items: [
      { kind: 'MELHORIA', text: 'Excluir uma compra do cartão, uma parcela ou uma movimentação da conta apaga o registro, sem deixar lançamento cancelado.' },
      { kind: 'MELHORIA', text: 'O que já foi pago ou está ligado a outro registro continua protegido e é desfeito pelo estorno próprio.' },
    ],
  },
  {
    version: '3.6.0',
    codeOnly: true,
    date: '27/11/2026',
    title: 'Pendentes, previsto por conta e lembretes',
    summary: 'Lançamentos pendentes na conta, saldo previsto de cada conta e lembretes de fatura no sino.',
    items: [
      { kind: 'NOVIDADE', text: 'Registre entradas e saídas pendentes na conta e efetive quando acontecerem, inteiras ou em parte. Pendente não mexe no saldo.' },
      { kind: 'NOVIDADE', text: 'Veja o saldo previsto de cada conta até o fim do mês, na Visão geral.' },
      { kind: 'NOVIDADE', text: 'O sino avisa quando a fatura de um cartão vai fechar ou vencer nos próximos 3 dias.' },
    ],
  },
  {
    version: '3.5.3',
    codeOnly: true,
    date: '26/11/2026',
    title: 'Importar planilhas e PDF com senha',
    summary: 'Extratos e faturas em CSV e Excel (.xlsx) agora podem ser importados, e o pedido de senha do PDF ficou mais claro.',
    items: [
      { kind: 'NOVIDADE', text: 'Importe extratos e faturas em CSV ou Excel (.xlsx), com leitura no próprio aparelho.' },
      { kind: 'MELHORIA', text: 'Quando o PDF tem senha, o campo para digitar aparece em destaque no lugar do erro.' },
      { kind: 'CORRECAO', text: 'A opção de somar contratos agora informa corretamente que o saldo fica congelado, sem novos juros.' },
    ],
  },
  {
    version: '3.5.2',
    codeOnly: true,
    date: '26/11/2026',
    title: 'Conta e cartão no mesmo cadastro',
    summary: 'Ao criar um cartão você já pode criar a conta, e ao criar uma conta você já pode criar o cartão completo.',
    items: [
      { kind: 'MELHORIA', text: 'No cadastro do cartão, escolha logo: sem conta, conta que já tem ou criar a conta junto.' },
      { kind: 'MELHORIA', text: 'No cadastro da conta, o cartão criado junto já aceita dia do fechamento, vencimento e bandeira.' },
    ],
  },
  {
    version: '3.5.1',
    codeOnly: true,
    date: '26/11/2026',
    title: 'Ajustes de tela no contrato',
    summary: 'Correções na janela de recebimento, no extrato recente e no resumo do contrato no celular.',
    items: [
      { kind: 'CORRECAO', text: 'A janela de registrar recebimento ocupa a tela toda no celular, sem ficar deslocada.' },
      { kind: 'CORRECAO', text: 'O extrato recente do contrato não trava mais a rolagem da página e mostra os últimos lançamentos com opção de ver todos.' },
      { kind: 'CORRECAO', text: 'O extrato não mostra mais nomes técnicos em inglês e exibe valores no formato brasileiro.' },
      { kind: 'CORRECAO', text: 'O resumo Capital, Encargos e Valor original aparece alinhado em uma linha.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '26/11/2026',
    title: 'Limite, reabrir fatura e lembrete',
    summary: 'Compras podem ficar fora do limite, faturas pagas podem ser reabertas e a Visão geral avisa quando a fatura vai fechar.',
    items: [
      { kind: 'NOVIDADE', text: 'Marque uma compra como fora do limite: ela continua na fatura, mas não consome o limite do cartão.' },
      { kind: 'NOVIDADE', text: 'Reabra uma fatura paga: o pagamento volta para a conta e as compras voltam a ficar pendentes, sem apagar o histórico.' },
      { kind: 'NOVIDADE', text: 'A Visão geral avisa quando a fatura de um cartão fecha nos próximos 3 dias.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '26/11/2026',
    title: 'Fechamento da fatura como o do banco',
    summary: 'O cartão aceita fechamento alguns dias antes do vencimento, vencimento em dia útil e o fechamento real de cada mês.',
    items: [
      { kind: 'NOVIDADE', text: 'Escolha se a fatura fecha em um dia fixo ou alguns dias antes do vencimento.' },
      { kind: 'NOVIDADE', text: 'Vencimento em fim de semana ou feriado nacional pode passar para o próximo dia útil.' },
      { kind: 'NOVIDADE', text: 'Informe o fechamento real de uma fatura específica, sem mudar o cartão.' },
      { kind: 'MELHORIA', text: 'Mudar fechamento ou vencimento do cartão vale da fatura aberta em diante; faturas anteriores continuam como estavam.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '26/11/2026',
    title: 'Contrato com várias fontes',
    summary: 'Criar contrato usando mais de uma fonte de capital voltou a funcionar.',
    items: [
      { kind: 'CORRECAO', text: 'Contratos com mais de uma fonte de capital voltam a registrar a saída de cada fonte; no cartão, a compra usa a data do empréstimo.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '26/11/2026',
    title: 'Fatura e parcelas mais seguras',
    summary: 'Levar o restante da fatura, antecipar parcelas e excluir parcelas agora acontecem de uma vez só, sem risco de ficar pela metade.',
    items: [
      { kind: 'CORRECAO', text: 'Levar o restante da fatura para a próxima ou parcelá-lo voltou a funcionar.' },
      { kind: 'CORRECAO', text: 'Antecipar parcelas mantém a compra e a numeração original; o desconto aparece como crédito na fatura.' },
      { kind: 'CORRECAO', text: 'Excluir só uma parcela, ou ela e as seguintes, não recria mais a compra e preserva as parcelas pagas.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '25/11/2026',
    title: 'Regras da fatura em vigor',
    summary: 'As correções de fatura, edição de lançamento e data de empréstimo no cartão passaram a valer no servidor.',
    items: [
      { kind: 'CORRECAO', text: 'Compras vão para a fatura da data da compra; compra feita no dia do fechamento entra na fatura seguinte.' },
      { kind: 'CORRECAO', text: 'Trocar só a descrição, a categoria ou a observação de um lançamento não refaz mais as parcelas.' },
      { kind: 'CORRECAO', text: 'Empréstimos novos pagos no cartão geram a compra com a data do empréstimo.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '25/11/2026',
    title: 'Cartões lado a lado no computador',
    summary: 'No computador os cartões aparecem juntos, com medidor de limite; empréstimos pagos no cartão usam a data do empréstimo.',
    items: [
      { kind: 'MELHORIA', text: 'No computador, todos os cartões aparecem lado a lado: clique para escolher, use as setas para trocar e veja o verso por botão.' },
      { kind: 'NOVIDADE', text: 'Cada cartão mostra o gasto, o limite disponível e uma barra com quanto do limite já foi usado.' },
      { kind: 'MELHORIA', text: 'O cartão ficou mais limpo: proporção real, logotipo discreto e sem informações vazias na frente; titular e validade ficam no verso.' },
      { kind: 'CORRECAO', text: 'Empréstimo pago no cartão passa a gerar a compra com a data do empréstimo, e não com a data em que foi digitado.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '24/11/2026',
    title: 'Carteira: faturas e categorias mais claras',
    summary: 'Ciclos mais fiéis ao banco, categorias visuais e lançamentos rápidos mais claros.',
    items: [
      { kind: 'NOVIDADE', text: 'A fatura do cartão mostra os gastos por categoria, com ícone e anel medidor.' },
      { kind: 'NOVIDADE', text: 'O detalhe da conta mostra as despesas do mês por categoria, com gasto médio por dia.' },
      { kind: 'MELHORIA', text: 'Na nova despesa, a categoria é escolhida por ícones.' },
      { kind: 'MELHORIA', text: 'O relatório ganhou um gráfico de rosca por categoria.' },
      { kind: 'MELHORIA', text: 'A Visão geral mostra as despesas por categoria com ícone e anel medidor.' },
      { kind: 'CORRECAO', text: 'Despesas pagas pela conta passam a contar no resumo de gastos do mês, que antes mostrava só o cartão.' },
      { kind: 'MELHORIA', text: 'Importações reconhecem mais categorias, como juros e encargos do cartão, impostos e assinaturas digitais.' },
      { kind: 'CORRECAO', text: 'Editar a descrição ou a categoria de uma compra parcelada não renumera mais as parcelas.' },
      { kind: 'CORRECAO', text: 'Compra feita antes do fechamento e lançada depois entra na fatura certa, enquanto ela ainda não venceu nem foi paga.' },
      { kind: 'CORRECAO', text: 'Compra feita no dia do fechamento passa para a fatura seguinte, como no banco.' },
      { kind: 'CORRECAO', text: 'Sobras de faturas antigas não ocupam mais o lugar da fatura atual.' },
      { kind: 'CORRECAO', text: 'A previsão do mês passa a considerar faturas e contas atrasadas ainda não pagas.' },
      { kind: 'MELHORIA', text: 'O disponível informado pelo banco é atualizado com as compras lançadas depois dele.' },
      { kind: 'MELHORIA', text: 'A fatura do cartão mostra o valor lançado em destaque, é nomeada pelo mês de vencimento e abre na fatura a pagar.' },
      { kind: 'MELHORIA', text: 'O disponível do cartão é identificado como tal, e o aviso da fatura só aparece quando há diferença que as compras novas não explicam.' },
      { kind: 'CORRECAO', text: 'A edição de compra importada reconstrói somente as parcelas restantes, sem criar parcelas acima do total.' },
      { kind: 'CORRECAO', text: 'A conferência da fatura desconta pagamentos feitos após a referência bancária.' },
      { kind: 'CORRECAO', text: 'A edição reduz compromissos acima do limite e vencimentos informados respeitam o mês mínimo de abertura.' },
      { kind: 'CORRECAO', text: 'Tocar em Carteira com um cartão ou conta abertos agora retorna à Visão geral da Carteira, sem sair para o Painel.' },
      { kind: 'CORRECAO', text: 'Campo de valor bloqueia letras ao digitar ou colar, aceitando somente números e operações válidas.' },
      { kind: 'MELHORIA', text: 'A categoria da despesa muda automaticamente conforme a descrição (como Google, Uber ou Farmácia), respeitando alterações manuais.' },
      { kind: 'CORRECAO', text: 'Em fatura fechada ou vencida, a data da compra fica limitada até o fechamento com aviso curto e objetivo.' },
      { kind: 'MELHORIA', text: 'Busca e resultado/total ficam na mesma linha horizontal no celular e no computador, nas contas e na fatura do cartão.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '23/11/2026',
    title: 'Resumo mais legível nos cartões de empréstimo',
    summary: 'Capital, encargos e valor original aparecem em áreas próprias no cartão expandido.',
    items: [
      { kind: 'MELHORIA', text: 'O cabeçalho separa os valores do resumo e deixa o principal mais fácil de localizar.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '23/11/2026',
    title: 'Carregamento mais resiliente no PWA',
    summary: 'Falhas no cache local não impedem mais abrir páginas online.',
    items: [
      { kind: 'CORRECAO', text: 'Páginas carregadas sob demanda continuam abrindo quando o navegador não consegue ler ou gravar um arquivo no cache.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '22/11/2026',
    title: 'Limite bancário estável na Carteira',
    summary: 'Evita exibir um limite estimado temporário ao abrir o cartão.',
    items: [
      { kind: 'CORRECAO', text: 'Referência bancária já registrada aparece desde o primeiro carregamento do cartão.' },
      { kind: 'MELHORIA', text: 'Na ausência de referência em cache, a tela informa que está conferindo antes de apresentar estimativas.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '22/11/2026',
    title: 'Atalhos Android e leitura do estado',
    summary: 'Toque na notificação abre a Carteira; botões lançam gasto ou entrada.',
    items: [
      { kind: 'CORRECAO', text: 'O toque fora dos dois atalhos abre a Visão geral da Carteira, não o formulário de despesa.' },
      { kind: 'MELHORIA', text: 'A situação do canal é reconsultada ao voltar do Android e informa quando as notificações estiverem bloqueadas.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '22/11/2026',
    title: 'Destaque de notificações Android',
    summary: 'Ajuste do destaque e acesso à prioridade definida no aparelho.',
    items: [
      { kind: 'CORRECAO', text: 'O destaque da notificação não é mais silenciado artificialmente pelo próprio aplicativo.' },
      { kind: 'MELHORIA', text: 'O Perfil informa a importância da notificação e abre sua configuração no Android.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '22/11/2026',
    title: 'Valores coerentes e navegação por etapas na Carteira',
    summary: 'Limites bancários e estimativas identificados corretamente, com Voltar pelo histórico da Carteira.',
    items: [
      { kind: 'CORRECAO', text: 'O limite exibido na Visão geral acompanha a referência datada da tela Cartões; sem referência válida, aparece como estimado.' },
      { kind: 'MELHORIA', text: 'Os totais de cartões identificam quando somam valores informados pelo banco e valores estimados. A Visão geral revalida os dados ao entrar.' },
      { kind: 'CORRECAO', text: 'Voltar agora percorre cartão, lista de Cartões, Visão geral e Painel. A navegação das contas recebe o mesmo tratamento.' },
    ],
  },
  {
    version: '3.5.0',
    commit: '3c297100200e947a3580405779a53ce9d4714b02',
    date: '22/11/2026',
    title: 'Cartões, empréstimos e atalhos do Android',
    summary: 'Conciliação de compras já feitas no cartão, informações bancárias mais claras e notificação de lançamento rápido simplificada.',
    items: [
      {
        kind: 'CORRECAO',
        text: 'Empréstimos financiados por cartão não descontam novamente o capital da fonte. Compras já cobradas podem ser registradas mediante data, valor e identificação bancária.',
      },
      {
        kind: 'MELHORIA',
        text: 'O limite informado pelo banco tem data e identificação próprias e não é confundido com o limite estimado pelos lançamentos.',
      },
      {
        kind: 'CORRECAO',
        text: 'Diferenças de fatura passam a descontar créditos e estornos, sem contá-los como novas compras.',
      },
      {
        kind: 'MELHORIA',
        text: 'Lançamento rápido foi movido para Preferências & Menus. A notificação Android agora tem texto reduzido, ações distintas e destaque opcional silencioso.',
      },
    ],
  },
  {
    version: '3.5.0',
    commit: 'dd4cd9b8c76ae05e72697cbffde913402f665bbd',
    date: '21/11/2026',
    title: 'Pesquisa, faturas e cartões mais organizados',
    summary: 'Busca mais abrangente e menos informações repetidas na Carteira, com ajustes para utilização no Android.',
    items: [
      {
        kind: 'MELHORIA',
        text: 'Extratos permitem buscar valores e datas. Pesquisa de contratos foi ajustada para não ficar encoberta pelo teclado no Android.',
      },
      {
        kind: 'MELHORIA',
        text: 'Fatura atual em destaque; dados secundários recolhidos em Detalhes e Valores do banco.',
      },
      {
        kind: 'CORRECAO',
        text: 'Logotipos de bancos e cartões reaproveitados nos seletores e lançamentos; transferências exibem conta de origem e saldo.',
      },
      {
        kind: 'CORRECAO',
        text: 'Registro manual de despesas com tratamento de espera e sugestões de categoria pela descrição.',
      },
    ],
  },
  {
    version: '3.5.0',
    commit: '66972c275',
    date: '20/11/2026',
    title: 'Organização e conciliação da Carteira',
    summary: 'Aprimoramentos de navegação, extratos e tratamento auditável de operações financiadas por cartão.',
    items: [
      {
        kind: 'MELHORIA',
        text: 'Navegação entre contas, revisão de descrições financeiras e edição com histórico.',
      },
      {
        kind: 'CORRECAO',
        text: 'Desembolsos financiados por cartão não devem aparecer como gastos de conta bancária.',
      },
      {
        kind: 'CORRECAO',
        text: 'Mecanismos auditáveis para tratar débitos duplicados relacionados a empréstimos financiados no cartão.',
      },
    ],
  },
  {
    version: '3.5.0',
    date: '19/11/2026',
    title: 'Minha Carteira liberada para todos e melhorias em faturas',
    summary:
      'A gestão pessoal de contas, cartões e faturas agora está disponível para todos os usuários autenticados, com leitura local de extratos e alertas mais precisos.',
    items: [
      {
        kind: 'NOVIDADE',
        text: 'Minha Carteira liberada para todos os perfis autenticados, com isolamento individual de contas, cartões, despesas e faturas.',
      },
      {
        kind: 'NOVIDADE',
        text: 'Nova tela de Histórico de Atualizações no Perfil para acompanhar as novidades de cada versão.',
      },
      {
        kind: 'MELHORIA',
        text: 'Importação de faturas e extratos em arquivos OFX e PDF com texto 100% local no dispositivo, com busca por descrição, data, valor ou parcela e comparação automática com o total da fatura.',
      },
      {
        kind: 'MELHORIA',
        text: 'Lançamentos e parcelamentos no cartão passam a usar a fatura aberta atual como padrão, preservando a data original da compra e evitando gravações acidentais em faturas antigas.',
      },
      {
        kind: 'MELHORIA',
        text: 'Confirmações internas no lugar de janelas nativas do navegador e contraste aprimorado nos ícones de calendário no tema escuro.',
      },
      {
        kind: 'CORRECAO',
        text: 'Alertas de contratos já quitados ou encerrados não são mais exibidos após a baixa da parcela.',
      },
      {
        kind: 'CORRECAO',
        text: 'Detector de faturas ampliado para Bradesco, PicPay, Santander, Banco do Brasil, Inter e Caixa, evitando falsos alertas de banco divergente.',
      },
    ],
  },
  {
    version: '3.4.0',
    date: '16/11/2026',
    title: 'Janelas suspensas, extrato geral das contas e digitação por centavos',
    summary:
      'Navegação mais enxuta no celular e experiência padronizada para digitação de valores monetários em toda a plataforma.',
    items: [
      {
        kind: 'NOVIDADE',
        text: 'Extrato geral das contas na Carteira com busca rápida e navegação direta para o detalhe da conta.',
      },
      {
        kind: 'MELHORIA',
        text: 'Ações de contas e importação de faturas passaram a abrir em janelas suspensas adaptadas ao teclado no celular.',
      },
      {
        kind: 'MELHORIA',
        text: 'Calculadora monetária padronizada com deslocamento automático de centavos em expressões e colagem de valores em reais.',
      },
      {
        kind: 'MELHORIA',
        text: 'Seleção de conta ou fonte de destino opcional no recebimento de parcelas e saques de lucro.',
      },
    ],
  },
  {
    version: '3.3.0',
    date: '14/11/2026',
    title: 'Lançamentos fixos embutidos na conta e padronização de datas',
    summary:
      'Receitas e despesas recorrentes agora ficam organizadas dentro de cada conta, com datas de negócio alinhadas ao fuso de Manaus.',
    items: [
      {
        kind: 'NOVIDADE',
        text: 'Receitas fixas e despesas recorrentes integradas diretamente no detalhe da conta de origem ou destino.',
      },
      {
        kind: 'MELHORIA',
        text: 'Datas de vencimento de acordos, contas a pagar e régua de cobrança padronizadas no calendário de Manaus.',
      },
      {
        kind: 'MELHORIA',
        text: 'Nova apresentação na tela de entrada explicando o fluxo completo de gestão de contratos, fontes e carteira.',
      },
    ],
  },
];
