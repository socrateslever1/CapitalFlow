# Links individuais de assinatura: controles implementados e limites

## Problema confirmado (03/11/2026)
A RPC exposta `sign_documento_juridico_by_view_token` aceitava `papel`, `nome` e `CPF` fornecidos pelo navegador, sem validar identidade, papel previsto, documento cancelado, validade do token ou vínculo com contrato. Ela fazia a verificação de duplicidade sem bloquear a linha do documento antes da gravação, deixando janela de concorrência.

## Política desta etapa
- Token de visualização é uma credencial do tipo *bearer*. A mera posse **não constitui verificação de identidade**.
- Nome e CPF/CNPJ enviados devem coincidir com os campos de papel esperado no snapshot jurídico; tentativa de papel não previsto é recusada.
- Documentos cancelados, assinados, bloqueados, expirados, incompletos ou de contrato cancelado/arquivado não recebem assinatura.
- Documento vinculado a contrato exige proprietário e cliente consistentes; pré-contrato exige vínculo ativo por `client_registration_links`.
- Oito rascunhos legados com view_token e sem vínculo de contrato ou cadastro ficam indisponíveis para *novas* assinaturas; não são excluídos nem reclassificados.
- `SELECT FOR UPDATE` e unicidade de `document_id, papel` protegem de gravação duplicada.
- A migração conserva todas as funções antigas necessárias e seus argumentos/defaults públicos, sem alterar os dados existentes. A mudança é protegida por MD5 da definição original e verificação de tokens duplicados.
- Frontend só exibe sucesso quando a RPC confirma `success === true`.

## Testes e homologação
- Regression `tests/architecture/individual-signature-link-hardening.test.mjs` e Quality Gates.
- Consulta só-leitura `tests/db/individual-signature-link-hardening-readonly.sql` valida papéis e rejeição a links inexistentes sem alterar registros.
- Conferir contagem de documentos, assinaturas e contratos antes/depois da migração.
- Verificar que as rotas existentes `portal_sign_document` (token+código) permanecem funcionais.

## Limitações e riscos restantes
1. O snapshot do documento é consultável por quem possui o link. Nome e número de documento iguais ao snapshot representam **consistência do formulário**, não identidade verificada. A solução completa requer **tokens diferentes por papel e destinatário**, com expiração individual, autenticação adicional e auditoria de entrega.
2. O `p_hash_assinado` confirma apenas formato de SHA-256 do recibo; não recompõe o hash da versão canônica e assinada do documento.
3. A RPC `get_documento_assinaturas_by_view_token` devolve mais dados pessoais do que o necessário; requer projeção reduzida em serviço de leitura público.
4. `sign_legal_doc_public` e outros caminhos legados exigem auditoria de uso antes de revogar permissões que possam afetar links distribuídos.
5. Testes com sessões reais distintas e homologação visual em aparelhos permanecem pendentes.
