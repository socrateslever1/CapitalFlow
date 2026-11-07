-- Harmoniza a validade de condições financeiras com a data civil de Manaus.
-- A alteração é restrita a funções conhecidas e aborta se o corpo do banco tiver divergido.
-- CREATE OR REPLACE conserva assinatura, proprietário e privilégios atuais das RPCs.
-- Nenhum registro de cliente, parcela, pagamento ou conta é alterado.
DO $$
DECLARE
  v_function record;
  v_oid oid;
  v_source text;
  v_revised text;
  v_current_date_count integer;
BEGIN
  FOR v_function IN SELECT * FROM (VALUES
    ('public.process_installment_payment_offer_partial(uuid,uuid,uuid,uuid,uuid,numeric,date,uuid,uuid)', 'd469e355c28c910cd7ac4d3285215fd0', 1),
    ('public.process_installment_payment_offer(uuid,uuid,uuid,uuid,uuid,numeric,date,uuid,uuid)', 'd5baa0de01d9fb6055394a4b0dc750a2', 1),
    ('public.process_interest_renewal_payment_offer(uuid,uuid,uuid,uuid,uuid,numeric,date,uuid,uuid)', 'dce6f7d3427fbb3780ab57c4fcfe2688', 1),
    ('public.set_installment_payment_offer_v2(uuid,uuid,date,date,numeric,numeric,boolean,boolean,text)', '15f55592b09a25d04256b003eba799b4', 2),
    ('public.set_installment_payment_offer_v3(uuid,uuid,date,date,numeric,numeric,boolean,boolean,text,text)', '858eeb984f35a8a7b2d9a2a272c9f9c7', 1),
    ('public.set_installment_payment_offer(uuid,uuid,date,date,numeric,numeric,boolean,text)', 'b207d77b0212faba8ebb824bef77b2de', 1)
  ) AS original_functions(signature, definition_md5, expected_mentions)
  LOOP
    v_oid := to_regprocedure(v_function.signature);
    IF v_oid IS NULL THEN
      RAISE EXCEPTION 'Função financeira ausente: %', v_function.signature;
    END IF;
    v_source := pg_get_functiondef(v_oid);
    IF md5(v_source) IS DISTINCT FROM v_function.definition_md5 THEN
      RAISE EXCEPTION 'Definição financeira divergente em %; migração não aplicada', v_function.signature;
    END IF;
    v_current_date_count := (length(v_source) - length(replace(v_source, 'CURRENT_DATE', '')))
      / length('CURRENT_DATE');
    IF v_current_date_count <> v_function.expected_mentions THEN
      RAISE EXCEPTION 'Quantidade de referências a CURRENT_DATE inesperada em %', v_function.signature;
    END IF;

    v_revised := replace(v_source, 'CURRENT_DATE',
      '((now() AT TIME ZONE ''America/Manaus'')::date)');
    EXECUTE v_revised;

    IF position('CURRENT_DATE' IN pg_get_functiondef(v_oid)) > 0 THEN
      RAISE EXCEPTION 'Persistiu referência UTC em %', v_function.signature;
    END IF;
  END LOOP;
END $$;
