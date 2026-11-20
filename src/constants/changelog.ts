export type ChangelogEntryKind = 'NOVIDADE' | 'MELHORIA' | 'CORRECAO';

export interface ChangelogItem {
  kind: ChangelogEntryKind;
  text: string;
}

export interface ChangelogRelease {
  version: string;
  date: string;
  title: string;
  summary: string;
  items: ChangelogItem[];
}

/**
 * Registro oficial de atualizações exibido na área de Perfil.
 * Sempre adicionar novas versões no topo desta lista.
 */
export const SYSTEM_CHANGELOG: ChangelogRelease[] = [
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
