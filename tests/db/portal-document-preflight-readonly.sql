-- Somente leitura: valida comportamentos sem tocar dados de produção.
select
  public.legal_document_missing_fields_v1(
    jsonb_build_object('creditorName','A','creditorDoc','123','debtorName','B','debtorDoc','456',
    'amount','200','totalDebt','260','city','Manaus','state','AM')
  ) = '[]'::jsonb as complete_snapshot_valid,
  jsonb_array_length(public.legal_document_missing_fields_v1(
    jsonb_build_object('creditorName','A','debtorName','B')
  )) = 6 as missing_fields_detected,
  (public.portal_document_signing_check_v1('invalid','invalid','00000000-0000-4000-8000-000000000001'::uuid)->>'can_sign')::boolean is false as invalid_token_rejected,
  (public.portal_document_signing_check_v1('00000000-0000-4000-8000-000000000001','wrong','00000000-0000-4000-8000-000000000001'::uuid)->>'can_sign')::boolean is false as unknown_contract_rejected,
  (public.rpc_doc_missing_fields('00000000-0000-4000-8000-000000000001'::uuid)->>'can_sign')::boolean is false as missing_owner_rejected;
