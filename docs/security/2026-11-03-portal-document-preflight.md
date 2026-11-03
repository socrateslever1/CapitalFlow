# Fase 2 — assinatura documental com verificação obrigatória

## Defeitos confirmados
- `rpc_doc_missing_fields(uuid)` respondia `can_sign: true` para qualquer identificador.
- A assinatura por token + código aceitava documento de outro contrato do mesmo cliente.
- O fluxo permitia enviar papel `CREDITOR` com credenciais do portal do devedor.
- A interface tratava `success: false` como assinatura concluída.

## Implementação
- `legal_document_missing_fields_v1(jsonb)` verifica campos mínimos de CONFISSAO e MÚTUO.
- `portal_document_signing_check_v1(token,codigo,documento)` exige contrato exato, proprietário, status, credenciais válidas, snapshot, hash formal e documento pendente.
- `rpc_doc_missing_fields(uuid)` deixa de ser público: retorna situação somente para o proprietário autenticado. `rpc_doc_can_sign` herda essa restrição.
- A RPC de assinatura atual faz preflight no banco **antes de inserir**, exige documento e devedor correspondente, papel DEBTOR, versão quando informada e proíbe substituir token de assinatura.
- Correção da interface para enviar token+código e interpretar confirmação do banco; outros papéis assinam pelos links individuais.
- A migração compara os fingerprints das funções existentes antes de alterar suas definições. Não altera linhas ou valores de contratos e documentos existentes.

## Homologação e limitações
- Testes de contrato sintéticos verificam campos obrigatórios e falha para token inválido.
- Testes de frontend validam envio de credenciais e rejeição de retornos sem confirmação.
- Dados reais: existiam 2 documentos de confissão pendentes com snapshot incompleto; devem continuar sem assinatura até correção de cadastro.
- A assinatura por token próprio do documento (links individuais de credor/testemunha) usa outra RPC e exige auditoria separada.
- Esta fase verifica formato de hash e vínculo, mas **não reconstitui criptograficamente o hash do PDF/documento**. Esse mecanismo precisa homologação específica.
- Prova de isolamento intertenant com sessões reais diferentes permanece pendente; validações por metadados e credenciais falsas não substituem esse ensaio.
