-- Manual verification query for the security hardening migration.
-- Expected for legacy ID-only overloads: anon=false, authenticated=false.
-- Expected for current token+shortcode overloads: anon=true, authenticated=true.

select p.oid::regprocedure::text as function_signature,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('portal_get_client','portal_get_full_loan','portal_get_parcels','portal_get_signals','portal_list_contracts')
order by p.proname, function_signature;
