# Carteira — estado de continuidade e proteção contra regressões
Atualizado: 30/10/2026. Documento versionado junto às alterações da Carteira.

## Intenção de produto
Interface compacta, visual, semelhante a um banco digital, com cartões e contas reais cadastrados pelo usuário; assistência de gastos baseada apenas nos registros existentes. Mobile, tablet, desktop e APK usam o mesmo SaaS híbrido.

## Escopo preservado
- Nenhuma mudança de ledger, RPC de pagamento, estorno ou saldo, tabelas `personal_wallet_*` ou políticas RLS neste trabalho.
- `WalletOverviewSummary` mantém links para detalhes do cartão e valores calculados pelo domínio existente.
- `WalletSpendingGuide` é somente leitura. A projeção não é saldo bancário garantido.
- No importador, revisão e confirmação explícitas são obrigatórias antes do registro via `personalWalletService.recordStatementRow`. A baixa financeira utiliza os métodos canônicos existentes.

## Importação de extratos e faturas
- OFX/QFX: processado localmente, suporta SGML/XML, datas válidas, Windows-1252 e valores com vírgula/ponto. Compras em cartão são positivas; estornos/pagamentos são negativos e **não selecionados**. FITID fornece chave estável da transação.
- PDF com texto selecionável: processamento local via pdfjs. Suporta valores brasileiros, datas DD/MM, datas com mês abreviado (por exemplo 10 out) e data/valor em linhas consecutivas. Resultados começam desmarcados para conferência.
- PDF digitalizado/imagem: texto pode estar ausente. O botão “Ler PDF com IA” só envia o PDF ao Google Gemini após uma confirmação explícita do usuário e configuração de API, com possível cobrança da API.
- Não inventar lançamentos ausentes, nem usar valor total da fatura como uma compra.
- PDFs bancários possuem layouts variados: sem faturas reais de cada instituição, não é correto afirmar reconhecimento universal. Alguns extratos ainda precisam de correção manual.
- Sem envio automático de documentos bancários para serviços externos.

## Verificações de regressão
- `npm run test:wallet-statement-import`: OFX comprado/estornado, charset e datas, PDF de tabela/parcelas e opt-in para IA.
- `npm run test:quality`: build, gates gerais e importador.
- Testar visualmente no APK: espaço reduzido, campos de edição, listas longas, correção de sinais e seleção/desmarcação.
- Antes de publicar, inspecionar diff e não tocar em serviços financeiros sem autorização específica.

## Pendências
- Teste com PDFs/OFX reais e anonimizados de bancos variados, incluindo faturas digitalizadas.
- Conferência visual em aparelho Android e tablet físicos.
- Revisão de segurança do cofre de cartão, especialmente armazenamento de CVV/CVC (fora do escopo e não alterado).
- Quality Gate geral de dependências tem apresentado falhas independentes do build Android; acompanhar e não declarar aprovação global sem verificar.
