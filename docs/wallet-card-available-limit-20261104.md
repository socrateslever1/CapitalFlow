# Correção do limite disponível no cartão — 04/11/2026

O formulário de situação inicial permitia preencher limite total, fatura e limite usado, mas tratava a fatura como base do comprometimento. Isso subestimava o limite usado quando havia parcelas ou outras operações fora da fatura corrente.

Agora:
- O campo **Limite disponível no banco (R$)** começa vazio, evitando pressupor que o disponível estimado corresponde ao extrato.
- Quando informado, calcula **limite usado = limite total − limite disponível**, sempre em centavos.
- A fatura atual permanece independente. A diferença entre usado e fatura representa compromissos não alocados, sem gerar compras duplicadas.
- O campo usado continua editável, inclusive para saldos acima do limite; ao editar manualmente, o disponível antes informado é limpo para não manter dados conflitantes.
- Ao alterar o total, o limite usado é recalculado automaticamente enquanto o disponível informado está preenchido.
- Quando o disponível é maior que o limite total, ou quando o limite usado calculado é menor que a fatura mais compromissos existentes, o formulário rejeita o salvamento.
- O valor só é persistido pelo RPC financeiro existente. Não há migration nem alteração de contratos, compras, faturas ou saldos históricos.

Caso de regressão: limite R$ 6.991,30, disponível R$ 2.180,35 e fatura R$ 3.270,40 => usado R$ 4.810,95 e diferença fora da fatura R$ 1.540,55.
