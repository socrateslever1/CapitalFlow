# Verificação financeira — vigência de condições em Manaus (03/11/2026)

## Falha identificada
O frontend calculava o dia com `new Date().toISOString().slice(0,10)` (UTC).
As funções de ofertas e pagamento consultavam `CURRENT_DATE` (fuso da sessão PostgreSQL, habitualmente UTC).
Após 20h em Manaus, a interface/servidor podiam considerar uma condição vencida quatro horas antes da meia-noite local.

## Correção
- `businessDateInManaus()` é a referência civil compartilhada pelo serviço e pelo modal de condições.
- As seis funções SQL conhecidas de criação, renovação e execução de condições usam agora `(now() AT TIME ZONE 'America/Manaus')::date` para decisões de validade e atraso.
- Migração com trava de MD5 do código atual do banco, assinaturas e número de ocorrências. Se houver divergência, nenhuma função é modificada.
- Testes automatizados cobrem 19h-24h, mudança de mês/ano, ativação/expiração e presença da migração.

## Escopo da homologação
Não altera operações financeiras nem saldos existentes. A conciliação por registro bancário externo e casos reais de renovação/estorno continuam sujeitos a ensaios integrados com extratos anonimizados.
A verificação CI não substitui execução da migração no Supabase nem a homologação em dispositivo físico.
