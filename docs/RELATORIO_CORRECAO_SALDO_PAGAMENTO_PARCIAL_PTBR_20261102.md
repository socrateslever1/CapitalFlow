# Relatório técnico — recebimento parcial, saldo e idioma

## Escopo da correção (02/11/2026)
O registro da operação de R$ 250,00, referente à parcela de março, foi conferido em modo somente leitura na `financial_operations`, `transacoes` e `parcelas`. A operação V4 preserva a identidade original e atribuiu R$ 39,00 a juros, R$ 211,00 a encargos por atraso e R$ 0,00 ao principal.

Na operação, o saldo **antes** era R$ 586,43 e o saldo **após** era R$ 336,43 (R$ 130,00 de capital e R$ 206,43 de encargos restantes).

A interface estava mostrando R$ 451,10 porque a estratégia mensal recalculava desde o vencimento toda a mora (R$ 300,30) e as multas recorrentes (R$ 20,80) sobre o principal de R$ 130,00 sem reconhecer os encargos pagos. Esse recálculo não pode substituir silenciosamente o último saldo persistido.

## Correção não invasiva
- Os cartões de contrato e parcela agora usam um **saldo de apresentação do último recebimento** quando há comprovadamente pagamento parcial mensal e componentes persistidos íntegros.
- O histórico informa valor já recebido, capital em aberto e encargos restantes. O valor não é anunciado como uma nova prévia de cobrança.
- O cálculo financeiro de novas operações, rotinas V4 do Supabase, política de mora, ordem dos abatimentos, estornos, saldos de fonte e transações anteriores **não foram alterados**.
- Um recebimento posterior exige nova conferência/validação da prévia financeira autoritativa. A apresentação do saldo registrado **não significa dispensa de juros posteriores**.
- Outros regimes de vencimento, acordos ativos e parcelas sem pagamento preservam seus cálculos anteriores.

## Questão financeira ainda a deliberar
O motor atual prioriza juros contratuais e encargos de atraso antes da amortização do principal. Alterar essa ordem ou dispensar encargos é uma mudança contratual e transacional, não uma correção visual. Deve ter uma política explícita por contrato e por pagamento, com simulação, auditoria, consentimento e testes de estorno; não converter automaticamente os R$ 250,00 pagos em capital.

## Localização: interface atual em português brasileiro
- O produto atual apresenta títulos, ações, recibos e mensagens destinados ao usuário em **pt-BR**, inclusive traduções de códigos internos de operações. Nunca renderizar `PAYMENT_RECEIVED` ou outros identificadores de sistemas como título de transação.
- Exceção técnica: campos do protocolo, nomes de classes, identificadores de bancos e códigos de integração permanecem inalterados internamente; não devem ser apresentados como texto de interface.
- Nova opção de idioma internacional será planejada em etapa separada: catálogos tipados de mensagens com chaves estáveis, parâmetros interpolados seguros, `Intl.NumberFormat`/`Intl.DateTimeFormat` por localidade, testes de ausência de chave e fallback `pt-BR`, persistência da escolha por usuário/perfil, sem duplicação de lógica financeira.
- Idiomas futuros não têm liberação nem seleção habilitada nesta correção. Não trocar rótulos por traduções literais sem revisão editorial e jurídica.
- Testes de tradução e regressão visual devem garantir a equivalência entre os valores e as legendas no navegador e no aplicativo Android.

## Validação
Testes devem verificar R$ 586,43 − R$ 250,00 = R$ 336,43, sem abater principal não pago, sem misturar perfis e sem modificar banco. Necessária homologação de compilação, testes de finanças e release antes de integrar ao ramo principal.
