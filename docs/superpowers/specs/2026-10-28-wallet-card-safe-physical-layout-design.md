# Cartão físico seguro na Carteira

## Objetivo

Recuperar na pilha de cartões o aspecto físico do primeiro módulo, organizando número, titular, validade, instituição e bandeira sem cortes em telas estreitas.

## Decisão

- A frente terá instituição e bandeira, linha compacta de chip/limite, número mascarado em linha própria e titular/validade no rodapé.
- O verso terá tarja magnética, assinatura, CVC protegido, emissor e ação textual `Copiar dados do cartão`.
- A cópia conterá somente identificação do cartão: apelido, emissor, bandeira, número mascarado, titular e validade.
- Limite, fatura, fechamento e vencimento da fatura não serão copiados.
- Número completo e CVC não serão recuperados de `notes`, persistidos ou expostos.

## Abordagens consideradas

1. Restaurar integralmente o componente antigo, inclusive leitura de número e CVC em `notes`: rejeitada por segurança.
2. Reaproveitar apenas a composição física antiga sobre os campos canônicos seguros: escolhida por preservar a aparência sem reintroduzir dados sensíveis.
3. Implantar cofre PCI para número completo: fora desta correção e incompatível com armazenamento de CVC.

## Critérios

- Nenhum texto ou valor deve colidir ou ser cortado no cartão móvel.
- A pilha, gesto horizontal, setas e giro devem permanecer.
- A cópia não deve conter informações financeiras.
- CVC deve permanecer mascarado.
