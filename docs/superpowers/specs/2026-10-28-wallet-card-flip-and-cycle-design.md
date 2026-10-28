# Cartão giratório, contas compactas e isolamento da fatura

## Intenção

Retirar temporariamente o painel intermediário de uso do crédito, devolver ao cartão a interação direta e garantir que a página apresente somente os dados do ciclo de fatura selecionado.

## Escopo aprovado

- O clique curto no cartão gira entre frente e verso no próprio componente.
- O arraste horizontal continua trocando o cartão ativo e não dispara o giro.
- O verso mostra somente dados canônicos disponíveis: instituição, bandeira, quatro últimos dígitos, fechamento, vencimento, limite total, utilizado e disponível.
- Campos úteis podem ser copiados individualmente e existe uma ação para copiar o resumo.
- O painel `WalletCardsSheet` deixa de participar desse fluxo.
- A listagem de contas reutiliza a linguagem visual compacta do painel removido: identidade da instituição, saldo e tipo, sem criar um novo modal.
- Ao trocar o mês, resumo, estado, datas, avisos e lançamentos passam a refletir exclusivamente o ciclo selecionado.

## Restrições

- Não armazenar, inventar ou apresentar número completo, validade ou CVV.
- Preservar navegação por setas, gesto de arrastar, ações de despesa, pagamento e edição.
- Respeitar redução de movimento, teclado, toque e foco visível.
- Não alterar cálculos ou dados persistidos fora do necessário para selecionar o ciclo visual.

## Abordagem

A alternativa de manter o painel e abrir detalhes nele foi descartada porque adiciona uma camada que o usuário não quer. A abordagem escolhida é o giro 3D no próprio cartão, com o mesmo componente atendendo mouse, toque e teclado. Para a fatura, a posição global de crédito permanece disponível para cálculo do limite, mas a apresentação do ciclo usa uma posição derivada do mês escolhido.

## Critérios de conclusão

- Clique/toque gira; arraste troca o cartão sem giro acidental.
- Trocar o cartão volta para a frente.
- Cópias usam apenas os dados do cartão ativo e fornecem retorno interno.
- O painel “Uso do crédito” não é renderizado pelo fluxo do cartão.
- A lista de contas mantém acesso aos detalhes e adota o acabamento compacto aprovado.
- Mudar o mês não mantém valor, estado, aviso ou lançamento da fatura anterior.
- Testes de domínio, interação, TypeScript e build passam.
