SET search_path = public;

ALTER TABLE public.whatsapp_configs
  ALTER COLUMN template_overdue_3d SET DEFAULT 'Ola, {nome_cliente}. Passando para lembrar que sua parcela de {valor_parcela} vence em 3 dias, no dia {data_vencimento}. Caso queira antecipar, use o Pix copia e cola: {copia_e_cola_pix}. Portal: {link_portal}',
  ALTER COLUMN template_due_today SET DEFAULT 'Ola, {nome_cliente}. Sua parcela de {valor_parcela} vence hoje ({data_vencimento}). Para manter tudo em dia, voce pode pagar pelo Pix copia e cola: {copia_e_cola_pix}. Portal: {link_portal}',
  ALTER COLUMN template_late SET DEFAULT 'Ola, {nome_cliente}. Consta em aberto a parcela de {valor_parcela}, vencida em {data_vencimento}. Regularize pelo Pix copia e cola: {copia_e_cola_pix} ou acesse seu portal: {link_portal}',
  ALTER COLUMN template_payment_received SET DEFAULT 'Ola, {nome_cliente}. Recebemos o pagamento de {valor_parcela} referente ao vencimento {data_vencimento}. Obrigado.';

UPDATE public.whatsapp_configs
SET
  template_overdue_3d = CASE
    WHEN COALESCE(trim(template_overdue_3d), '') = ''
      THEN 'Ola, {nome_cliente}. Passando para lembrar que sua parcela de {valor_parcela} vence em 3 dias, no dia {data_vencimento}. Caso queira antecipar, use o Pix copia e cola: {copia_e_cola_pix}. Portal: {link_portal}'
    ELSE template_overdue_3d
  END,
  template_due_today = CASE
    WHEN COALESCE(trim(template_due_today), '') = ''
      THEN 'Ola, {nome_cliente}. Sua parcela de {valor_parcela} vence hoje ({data_vencimento}). Para manter tudo em dia, voce pode pagar pelo Pix copia e cola: {copia_e_cola_pix}. Portal: {link_portal}'
    ELSE template_due_today
  END,
  template_late = CASE
    WHEN COALESCE(trim(template_late), '') = ''
      THEN 'Ola, {nome_cliente}. Consta em aberto a parcela de {valor_parcela}, vencida em {data_vencimento}. Regularize pelo Pix copia e cola: {copia_e_cola_pix} ou acesse seu portal: {link_portal}'
    ELSE template_late
  END,
  template_payment_received = CASE
    WHEN COALESCE(trim(template_payment_received), '') = ''
      THEN 'Ola, {nome_cliente}. Recebemos o pagamento de {valor_parcela} referente ao vencimento {data_vencimento}. Obrigado.'
    ELSE template_payment_received
  END;

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_configs'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.whatsapp_configs', v_policy.policyname);
  END LOOP;
END $$;

CREATE POLICY "whatsapp_configs_manage_by_profile"
ON public.whatsapp_configs
FOR ALL
TO authenticated
USING (
  profile_id IN (
    SELECT id
    FROM public.perfis
    WHERE user_id = auth.uid()
       OR email = auth.jwt() ->> 'email'
       OR usuario_email = auth.jwt() ->> 'email'
  )
)
WITH CHECK (
  profile_id IN (
    SELECT id
    FROM public.perfis
    WHERE user_id = auth.uid()
       OR email = auth.jwt() ->> 'email'
       OR usuario_email = auth.jwt() ->> 'email'
  )
);

DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'whatsapp_queue'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.whatsapp_queue', v_policy.policyname);
  END LOOP;
END $$;

CREATE POLICY "whatsapp_queue_manage_by_profile"
ON public.whatsapp_queue
FOR ALL
TO authenticated
USING (
  profile_id IN (
    SELECT id
    FROM public.perfis
    WHERE user_id = auth.uid()
       OR email = auth.jwt() ->> 'email'
       OR usuario_email = auth.jwt() ->> 'email'
  )
)
WITH CHECK (
  profile_id IN (
    SELECT id
    FROM public.perfis
    WHERE user_id = auth.uid()
       OR email = auth.jwt() ->> 'email'
       OR usuario_email = auth.jwt() ->> 'email'
  )
);

CREATE OR REPLACE FUNCTION public.handle_parcela_paid_whatsapp()
RETURNS TRIGGER AS $$
DECLARE
  v_contrato RECORD;
  v_config RECORD;
  v_message TEXT;
  v_phone TEXT;
BEGIN
  IF NEW.status = 'PAID' AND (OLD.status IS NULL OR OLD.status <> 'PAID') THEN
    SELECT id, debtor_name, debtor_phone, profile_id
      INTO v_contrato
    FROM public.contratos
    WHERE id = NEW.loan_id;

    IF v_contrato IS NULL OR COALESCE(v_contrato.debtor_phone, '') = '' THEN
      RETURN NEW;
    END IF;

    SELECT * INTO v_config
    FROM public.whatsapp_configs
    WHERE profile_id = v_contrato.profile_id;

    IF v_config IS NULL THEN
      RETURN NEW;
    END IF;

    v_phone := regexp_replace(v_contrato.debtor_phone, '\D', '', 'g');
    IF length(v_phone) < 10 THEN
      RETURN NEW;
    END IF;

    v_message := COALESCE(
      NULLIF(trim(v_config.template_payment_received), ''),
      'Ola, {nome_cliente}. Recebemos o pagamento de {valor_parcela} referente ao vencimento {data_vencimento}. Obrigado.'
    );
    v_message := replace(v_message, '{nome_cliente}', COALESCE(v_contrato.debtor_name, 'Cliente'));
    v_message := replace(v_message, '{valor_parcela}', 'R$ ' || to_char(COALESCE(NEW.valor_pago, NEW.valor_parcela, NEW.amount, 0.00), 'FM999G999G990D00'));
    v_message := replace(v_message, '{data_vencimento}', to_char(COALESCE(NEW.data_vencimento, NEW.due_date::date), 'DD/MM/YYYY'));
    v_message := replace(v_message, '{copia_e_cola_pix}', '');
    v_message := replace(v_message, '{link_portal}', '');

    INSERT INTO public.whatsapp_queue (
      profile_id,
      phone,
      message,
      status,
      loan_id,
      parcela_id
    ) VALUES (
      v_contrato.profile_id,
      v_phone,
      v_message,
      'PENDING',
      v_contrato.id,
      NEW.id
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.rpc_save_whatsapp_config(
  p_profile_id uuid,
  p_api_type text,
  p_api_url text DEFAULT NULL,
  p_token text DEFAULT NULL,
  p_instance_id text DEFAULT NULL,
  p_template_overdue_3d text DEFAULT NULL,
  p_template_due_today text DEFAULT NULL,
  p_template_late text DEFAULT NULL,
  p_template_payment_received text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_profile_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil nao informado.');
  END IF;

  IF COALESCE(trim(p_token), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Token nao informado.');
  END IF;

  IF p_api_type NOT IN ('META', 'EVOLUTION', 'Z_API') THEN
    RETURN jsonb_build_object('success', false, 'message', 'Tipo de API invalido.');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.perfis p
    WHERE p.id = p_profile_id
      AND (
        p.user_id = auth.uid()
        OR p.email = auth.jwt() ->> 'email'
        OR p.usuario_email = auth.jwt() ->> 'email'
      )
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Perfil sem permissao para salvar WhatsApp.');
  END IF;

  INSERT INTO public.whatsapp_configs (
    profile_id,
    api_type,
    api_url,
    token,
    instance_id,
    template_overdue_3d,
    template_due_today,
    template_late,
    template_payment_received,
    updated_at
  ) VALUES (
    p_profile_id,
    p_api_type,
    NULLIF(trim(COALESCE(p_api_url, '')), ''),
    trim(p_token),
    NULLIF(trim(COALESCE(p_instance_id, '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_template_overdue_3d, '')), ''), 'Ola, {nome_cliente}. Passando para lembrar que sua parcela de {valor_parcela} vence em 3 dias, no dia {data_vencimento}. Caso queira antecipar, use o Pix copia e cola: {copia_e_cola_pix}. Portal: {link_portal}'),
    COALESCE(NULLIF(trim(COALESCE(p_template_due_today, '')), ''), 'Ola, {nome_cliente}. Sua parcela de {valor_parcela} vence hoje ({data_vencimento}). Para manter tudo em dia, voce pode pagar pelo Pix copia e cola: {copia_e_cola_pix}. Portal: {link_portal}'),
    COALESCE(NULLIF(trim(COALESCE(p_template_late, '')), ''), 'Ola, {nome_cliente}. Consta em aberto a parcela de {valor_parcela}, vencida em {data_vencimento}. Regularize pelo Pix copia e cola: {copia_e_cola_pix} ou acesse seu portal: {link_portal}'),
    COALESCE(NULLIF(trim(COALESCE(p_template_payment_received, '')), ''), 'Ola, {nome_cliente}. Recebemos o pagamento de {valor_parcela} referente ao vencimento {data_vencimento}. Obrigado.'),
    now()
  )
  ON CONFLICT (profile_id) DO UPDATE SET
    api_type = EXCLUDED.api_type,
    api_url = EXCLUDED.api_url,
    token = EXCLUDED.token,
    instance_id = EXCLUDED.instance_id,
    template_overdue_3d = EXCLUDED.template_overdue_3d,
    template_due_today = EXCLUDED.template_due_today,
    template_late = EXCLUDED.template_late,
    template_payment_received = EXCLUDED.template_payment_received,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_save_whatsapp_config(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text
) TO authenticated;

NOTIFY pgrst, 'reload schema';
