-- Remove unused legacy public RPCs that disclose contract data with one token
-- or reveal the portal's second authentication factor.
-- Current portal client uses p_token + p_shortcode overloads; those are retained.
-- Do not replace these functions or mutate user/financial records.
BEGIN;
REVOKE EXECUTE ON FUNCTION public.portal_find_by_token(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_find_by_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_shortcode_by_portal_token(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_bundle(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_contract(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_list_contracts(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_full_loan(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_parcels(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.portal_get_signals(text, uuid) FROM PUBLIC, anon, authenticated;
-- Internal backend jobs retain role-specific access; PUBLIC never regains grants.
GRANT EXECUTE ON FUNCTION public.portal_find_by_token(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_find_by_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_get_shortcode_by_portal_token(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_get_bundle(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_get_contract(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_list_contracts(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_get_full_loan(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_get_parcels(text, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.portal_get_signals(text, uuid) TO service_role;
COMMIT;
NOTIFY pgrst, 'reload schema';
