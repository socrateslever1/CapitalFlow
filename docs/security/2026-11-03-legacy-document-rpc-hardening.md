# Proteção de sobrecargas de documentos jurídicos — 03/11/2026

## Falhas confirmadas

- `portal_update_doc_fields(uuid,jsonb)` permite alterar o snapshot de documento por identificador sem verificar autorização.
- Três versões antigas de `portal_sign_document` permitem assinatura por ID de documento sem conferir token + código do portal.
- `portal_get_doc(uuid,uuid)` aceita ID de contrato como se fosse token e pode revelar documentos.
- `portal_get_document_by_token(uuid,text)` utiliza somente token, ao contrário das rotas atuais com token + código.
- `ensure_client_portal_access(uuid)` já valida `auth.uid()`, mas não necessita estar executável por usuários anônimos.

## Correção

A migração `20261103210000_revoke_unsafe_legacy_document_rpc_grants.sql` revoga somente estas sobrecargas obsoletas de `PUBLIC`, `anon`, `authenticated`; mantém acesso controlado `service_role`. Para a função de geração de acesso, retém o papel `authenticated`.

O script exige correspondência exata de assinaturas e hashes de definições do banco antes de aplicar concessões. Divergência bloqueia a migração inteiramente.

Não altera documentos, clientes, contratos, transações, RLS, saldos, URLs públicas ou assinatura do aplicativo. Preserva as sobrecargas atuais com `p_token` + `p_shortcode`.

## Limites

Restam outras funções `SECURITY DEFINER` acessíveis. A análise é incremental; outros portais e integrações precisam de classificação e testes independentes.
