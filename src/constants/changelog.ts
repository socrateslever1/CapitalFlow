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
    version: '3.5.0',
    codeOnly: true,
    date: '23/11/2026',
    title: 'Confirmações bancárias sem duplicidade',
    summary: 'Novas confirmações e retransmissões têm comportamentos diferentes, com registro seguro por operação.',
    items: [
      { kind: 'CORRECAO', text: 'Repetir uma confirmação bancária não reinicia abatimentos nem altera novamente a referência.' },
      { kind: 'CORRECAO', text: 'Referências antigas sem data comprovada indicam que a projeção está indisponível, sem informar falsos abatimentos zero.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '23/11/2026',
    title: 'Confirmações seguras e limites sincronizados',
    summary: 'O limite projetado mantém a data correta após correções de fatura, repetições de confirmação e mudanças de cartão.',
    items: [
      { kind: 'CORRECAO', text: 'Repetir a mesma confirmação bancária não reinicia os abatimentos realizados depois da referência.' },
      { kind: 'CORRECAO', text: 'Corrigir somente uma fatura não altera a data-base do limite; o disponível permanece coerente entre Visão geral e Cartões.' },
      { kind: 'MELHORIA', text: 'O cartão apresenta o valor e a legenda da mesma referência, mesmo após atualizar os dados.' },
    ],
  },
  {
    version: '3.5.0',
    codeOnly: true,
    date: '23/11/2026',
    title: 'Limite projetado após os lançamentos',
    summary: 'Visão geral e Cartões calculam automaticamente a disponibilidade a partir da referência bancária e das compras posteriores.',
    items: [
      { kind: 'CORRECAO', text: 'Compras, créditos e pagamentos posteriores são considerados sem descontar novamente importações antigas.' },
      { kind: 'MELHORIA', text: 'Todas as telas compartilham a mesma projeção; a referência original continua identificada pela data do banco.' },
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
