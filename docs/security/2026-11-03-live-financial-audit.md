# Auditoria read-only de produção — 03/11/2026

Projeto: Supabase CapitalFlow `hzchchbxkhryextaymkn`.

Foram executados 13 controles (SQL versionado em `tests/db/financial-live-readonly-audit.sql`) em produção. Todos retornaram **0 ocorrências**: vínculo de proprietário entre registros, pagamentos e cartões, valores de parcelas, duplicação de `request_id`, decomposição dos pagamentos concluídos, idempotência de lançamentos e integridade básica dos estornos.

A análise é **limitada aos dados existentes e invariantes expressamente testados**: não demonstra correspondência com o extrato bancário, funcionamento da importação de documentos reais, isolamento cross-tenant em sessão de usuário diferente ou casos financeiros não cobertos. Não foram alterados dados financeiros nessa análise.

Uma auditoria de privilégios encontrou chamadas legadas `SECURITY DEFINER` acessíveis por `anon` e `authenticated`. Funções `portal_find_by_token` aceitam identificador do contrato como alternativa ao token e `portal_get_shortcode_by_portal_token` revela código de acesso do portal. A migration `20261103070000_revoke_legacy_portal_rpc_exposure.sql` revoga as permissões dessas rotas legadas, mantendo as rotas novas de token + shortcode usadas em `services/portal.service.ts`.

A remoção de índice duplicado é coberta por migration independente e só prossegue quando as definições dos índices são idênticas. Logs, medições de desempenho, capturas físicas Android e comparação do build Cloudflare ainda precisam de evidência própria.
