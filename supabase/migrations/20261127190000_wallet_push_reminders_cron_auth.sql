-- A Edge Function mantém a verificação de JWT ligada: a rotina diária passa a enviar a chave
-- pública do app (anon), guardada no Vault como 'wallet_push_reminder_anon_key', além do segredo
-- próprio da rotina. O valor da chave não fica no repositório; é criado no Vault do projeto.

do $setup$
begin
  if exists (select 1 from cron.job where jobname = 'wallet-invoice-push-reminders') then
    perform cron.unschedule('wallet-invoice-push-reminders');
  end if;
  -- 12:00 UTC = 08:00 em Manaus.
  perform cron.schedule('wallet-invoice-push-reminders', '0 12 * * *', $cron$
    select net.http_post(
      url := 'https://hzchchbxkhryextaymkn.supabase.co/functions/v1/wallet-invoice-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'wallet_push_reminder_anon_key' limit 1),
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'wallet_push_reminder_anon_key' limit 1),
        'x-reminder-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'wallet_push_reminder_secret' limit 1)),
      body := '{}'::jsonb
    );
  $cron$);
end
$setup$;
