# Carteira e Capital: implementação e preservação

Objetivo: remodelar as superfícies de consulta da Carteira e tornar consistente o vínculo opcional com Capital, preservando ferramentas e regras financeiras existentes.

## Limites

- Não modificar os editores legais, formulários de edição de contas/cartões, importadores, leitores, câmera, pagamentos, cálculos de juros/principal, assinaturas ou a cópia local não rastreada `capitalflow/CapitalFlow/`.
- Não vincular contas, reconstruir históricos ou ajustar saldos reais automaticamente.
- Manter RPCs públicas, acesso do administrador principal, isolamento por proprietário e vínculo com saldo igual.

## Etapas

1. Registrar e testar a sincronização de saldos no PostgreSQL isolado. Reutilizar a movimentação real de `fontes.balance` como evento; evitar aplicar o mesmo lançamento novamente ao inserir uma transação. Testar empréstimo, recebimento, estorno, transferência, divergência, isolamento, repetição e rollback.
2. Versionar as proteções de vínculo e espelhamento já presentes no banco. Criar uma migration aditiva, sem atualização de dados existentes. Exibir o vínculo e eventual divergência em um componente de consulta separado dos editores.
3. Substituir pilhas ilustradas da visão geral por listas compactas, preservando navegação dos cartões, todos os indicadores e a composição do balanço mensal. Reutilizar a lista de contas.
4. Unificar navegação, cabeçalhos e hierarquia das páginas de consulta: cartões, contas/PIX, compromissos e receitas. Preservar suas ações, modais e integrações; tratar celular e desktop separadamente.
5. Executar regressões financeiras e da Carteira, tipos, build e revisão do diff. Inspecionar a interface no navegador quando o acesso estiver disponível. Registrar separadamente qualquer limitação visual, de concorrência ou implantação.

## Critérios

- Uma alteração de saldo gera um único movimento na conta vinculada; nenhuma duplicação de débito/crédito por transação.
- Estornos seguem a alteração real de Capital, sem refazer sua distribuição financeira.
- Vínculos inconsistentes falham com mensagem clara; dados existentes permanecem intactos.
- Todas as ferramentas anteriores continuam acessíveis e os arquivos de edição preservados.
