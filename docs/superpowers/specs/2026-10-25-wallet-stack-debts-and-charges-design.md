# Carteira: pilha bancária, dívidas e cobranças

## Intenção
Transformar “Minha Carteira” em uma visão financeira pessoal mais direta: instituições aparecem como cartões empilhados com identidade própria, cartões podem pertencer a contas, obrigações com pessoas/empresas ficam visíveis e a cobrança PIX deixa de pedir dados já conhecidos pelo sistema.

## Decisões
- A tela abre em uma visão consolidada por instituição; tocar na pilha expande contas e cartões.
- A identidade visual usa catálogo e cores locais, sem rede. Upload de imagem deixa de ser necessário para contas.
- `account_id` em cartão é opcional: conta com débito e crédito é representada pelo vínculo; cartão sem conta continua válido.
- Dívidas a pagar têm credor pessoa/empresa, descrição, valor, vencimento e estado pendente/pago.
- A cobrança usa o nome do perfil como recebedor e mantém a cidade apenas como dado técnico automático do payload PIX; a interface não a solicita.
- O resultado oferece QR Code, Pix Copia e Cola e link compartilhável contendo os dados da cobrança.

## Abordagens consideradas
1. Substituir contas/cartões por uma entidade única. Rejeitada por exigir migração destrutiva e misturar saldo com limite.
2. Manter entidades e adicionar vínculo opcional, agrupando apenas na apresentação. Escolhida por preservar dados e comportamentos existentes.
3. Fazer somente uma pilha visual sem vínculo. Rejeitada porque não resolve conta com cartão versus cartão independente.

## Limites
O link é compartilhável e reabre a cobrança no próprio app; ele não cria uma cobrança dinâmica no banco nem confirma liquidação. Dados antigos continuam funcionando sem vínculo.
