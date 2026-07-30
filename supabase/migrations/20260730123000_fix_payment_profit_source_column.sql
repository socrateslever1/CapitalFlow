SET search_path = public, pg_temp;

DO $$
DECLARE
  v_signature regprocedure :=
    'public.process_payment_v3_selective(uuid,uuid,uuid,uuid,uuid,numeric,numeric,numeric,numeric,numeric,date,boolean,uuid,uuid)'::regprocedure;
  v_definition text;
BEGIN
  SELECT pg_get_functiondef(v_signature)
  INTO v_definition;

  IF position('COALESCE(nome, '''')' in v_definition) > 0 THEN
    v_definition := replace(
      v_definition,
      'COALESCE(nome, '''')',
      'COALESCE(name, '''')'
    );
    EXECUTE v_definition;
  END IF;
END;
$$;

ALTER FUNCTION public.process_payment_v3_selective(
  uuid, uuid, uuid, uuid, uuid,
  numeric, numeric, numeric, numeric, numeric,
  date, boolean, uuid, uuid
) SET search_path = public, extensions, pg_temp;

NOTIFY pgrst, 'reload schema';
