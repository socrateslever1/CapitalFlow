SET search_path = public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE public.contratos
  ADD COLUMN IF NOT EXISTS funding_calculation_mode text,
  ADD COLUMN IF NOT EXISTS funding_installments_count integer,
  ADD COLUMN IF NOT EXISTS funding_monthly_rate numeric,
  ADD COLUMN IF NOT EXISTS funding_installment_value numeric,
  ADD COLUMN IF NOT EXISTS customer_margin_percent numeric,
  ADD COLUMN IF NOT EXISTS customer_installment_value numeric,
  ADD COLUMN IF NOT EXISTS customer_total_payable numeric,
  ADD COLUMN IF NOT EXISTS skip_weekends boolean DEFAULT false;

ALTER TABLE public.contratos
  DROP CONSTRAINT IF EXISTS contratos_funding_calculation_mode_check;

ALTER TABLE public.contratos
  ADD CONSTRAINT contratos_funding_calculation_mode_check
  CHECK (funding_calculation_mode IS NULL OR funding_calculation_mode IN ('TOTAL', 'RATE'));

DO $$
BEGIN
  IF to_regclass('public.documentos_juridicos') IS NOT NULL THEN
    ALTER TABLE public.documentos_juridicos
      ADD COLUMN IF NOT EXISTS snapshot_rendered_html text,
      ADD COLUMN IF NOT EXISTS snapshot jsonb,
      ADD COLUMN IF NOT EXISTS snapshot_json jsonb DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS view_token text,
      ADD COLUMN IF NOT EXISTS public_access_token text,
      ADD COLUMN IF NOT EXISTS status_assinatura text DEFAULT 'PENDENTE',
      ADD COLUMN IF NOT EXISTS status text DEFAULT 'PENDENTE',
      ADD COLUMN IF NOT EXISTS testemunhas jsonb DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS tipo text,
      ADD COLUMN IF NOT EXISTS tipo_documento text,
      ADD COLUMN IF NOT EXISTS acordo_id uuid,
      ADD COLUMN IF NOT EXISTS loan_id uuid,
      ADD COLUMN IF NOT EXISTS profile_id uuid,
      ADD COLUMN IF NOT EXISTS dono_id uuid,
      ADD COLUMN IF NOT EXISTS hash_sha256 text,
      ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
      ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.cf_column_exists(
  p_table_name text,
  p_column_name text
) RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  );
$$;

DROP FUNCTION IF EXISTS public.create_documento_juridico_by_loan(uuid, text, jsonb, uuid, uuid);
DROP FUNCTION IF EXISTS public.create_documento_juridico_by_loan(uuid, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public.create_documento_juridico_by_loan(
  p_loan_id uuid,
  p_tipo text,
  p_snapshot jsonb,
  p_acordo_id uuid DEFAULT NULL,
  p_dono_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  hash_sha256 text,
  view_token text,
  status_assinatura text,
  created_at timestamptz,
  acordo_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_token text := encode(gen_random_bytes(32), 'hex');
  v_hash text := encode(digest(COALESCE(p_snapshot, '{}'::jsonb)::text, 'sha256'), 'hex');
  v_now timestamptz := now();
  v_payload jsonb;
  v_columns text;
BEGIN
  IF to_regclass('public.documentos_juridicos') IS NULL THEN
    RAISE EXCEPTION 'Tabela documentos_juridicos nao existe.';
  END IF;

  v_payload := jsonb_build_object(
    'id', v_id,
    'loan_id', p_loan_id,
    'acordo_id', p_acordo_id,
    'profile_id', p_dono_id,
    'dono_id', p_dono_id,
    'tipo', COALESCE(NULLIF(p_tipo, ''), 'CONFISSAO'),
    'tipo_documento', COALESCE(NULLIF(p_tipo, ''), 'CONFISSAO'),
    'snapshot', COALESCE(p_snapshot, '{}'::jsonb),
    'snapshot_json', COALESCE(p_snapshot, '{}'::jsonb),
    'hash_sha256', v_hash,
    'view_token', v_token,
    'public_access_token', v_token,
    'status_assinatura', 'PENDENTE',
    'status', 'PENDENTE',
    'testemunhas', COALESCE(p_snapshot -> 'witnesses', '[]'::jsonb),
    'created_at', v_now,
    'updated_at', v_now
  );

  SELECT string_agg(format('%I', c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO v_columns
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'documentos_juridicos'
    AND v_payload ? c.column_name;

  IF v_columns IS NULL THEN
    RAISE EXCEPTION 'Nenhuma coluna compativel encontrada em documentos_juridicos.';
  END IF;

  EXECUTE format(
    'INSERT INTO public.documentos_juridicos (%1$s)
     SELECT %1$s
     FROM jsonb_populate_record(NULL::public.documentos_juridicos, $1)',
    v_columns
  )
  USING v_payload;

  RETURN QUERY
  SELECT v_id, v_hash, v_token, 'PENDENTE'::text, v_now, p_acordo_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_documento_juridico_by_loan(uuid, text, jsonb, uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cf_column_exists(text, text) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
