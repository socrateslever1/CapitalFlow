-- Harden legacy/public RPC exposure without changing current portal/session flow.
-- Current portal.service.ts uses token + shortcode overloads; those remain public.

REVOKE EXECUTE ON FUNCTION public.portal_get_client(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_full_loan(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_parcels(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_signals(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_list_contracts(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_submit_payment_intent(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- These functions already validate auth.uid() internally; keep authenticated access,
-- but remove unnecessary anonymous/public execution.
REVOKE EXECUTE ON FUNCTION public.update_agreement_schedule_from_balance(uuid, text, date, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_or_archive_fonte(uuid) FROM PUBLIC, anon;
