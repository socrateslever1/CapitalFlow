-- Corrige incompatibilidade entre as RPCs atuais de assinatura e a constraint antiga.
-- As RPCs normalizam papeis para EN (DEBTOR/CREDITOR/WITNESS_N), enquanto a
-- constraint anterior aceitava apenas PT (DEVEDOR/CREDOR/TESTEMUNHA_N).

alter table public.assinaturas_documento
  drop constraint if exists assinaturas_documento_papel_check;

alter table public.assinaturas_documento
  add constraint assinaturas_documento_papel_check
  check (
    papel is null
    or papel in (
      'DEVEDOR',
      'CREDOR',
      'TESTEMUNHA_1',
      'TESTEMUNHA_2',
      'DEBTOR',
      'CREDITOR',
      'WITNESS',
      'WITNESS_1',
      'WITNESS_2',
      'AVALISTA',
      'GUARANTOR'
    )
  );
