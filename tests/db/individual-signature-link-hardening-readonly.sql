-- Auditoria exclusivamente de leitura, sem manipular documentos existentes.
SELECT
  public.legal_normalize_signature_role_v1('DEVEDOR') = 'DEBTOR' AS devedor_ok,
  public.legal_normalize_signature_role_v1('CREDOR') = 'CREDITOR' AS credor_ok,
  public.legal_normalize_signature_role_v1('TESTEMUNHA_2') = 'WITNESS_2' AS testemunha_ok,
  public.legal_normalize_signature_role_v1('PAPEL_INVENTADO') IS NULL AS papel_invalido_bloqueado,
  (public.sign_documento_juridico_by_view_token(
    'token_inexistente_para_teste','DEBTOR','A','00000000000',NULL,NULL,
    repeat('0',64),NULL,'{}'::jsonb
  )->>'success')::boolean = false AS token_inexistente_rejeitado;

SELECT
  (SELECT count(*) FROM public.contratos) AS contracts_total,
  (SELECT count(*) FROM public.documentos_juridicos) AS documents_total,
  (SELECT count(*) FROM public.assinaturas_documento) AS signatures_total,
  (SELECT count(*) FROM public.documentos_juridicos d
   WHERE nullif(btrim(view_token),'') IS NOT NULL AND d.loan_id IS NULL
     AND d.registration_link_id IS NULL AND status_assinatura IN ('PENDENTE','EM_ASSINATURA')) AS orphan_pending_links;
