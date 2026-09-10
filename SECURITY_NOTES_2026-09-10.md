# CapitalFlow security hardening — 2026-09-10

This pass intentionally preserves the current login/session behavior. Supabase Auth sessions are not given an inactivity timeout or forced lifetime here; users remain signed in until they explicitly sign out or Supabase invalidates the session for another reason.

## Changes applied

- Removed anonymous/authenticated execution from legacy ID-only portal RPC overloads that returned client, contract, installment or signal data without the current token + shortcode credential pair.
- Removed anonymous execution from agreement schedule editing and source deletion/archive RPCs; authenticated access remains.
- Removed anonymous/authenticated execution from the legacy payment-intent RPC that accepted arbitrary client/loan/profile IDs.
- Hardened `admin_set_profile_password`: it now requires a real authenticated caller mapped to an access-level-1 profile and is no longer executable anonymously.
- Current portal RPC overloads using token + shortcode remain untouched.

## Next audit priorities

- Review remaining SECURITY DEFINER financial RPCs one by one for ownership checks before changing grants.
- Review portal token/shortcode rate limiting and brute-force resistance.
- Review service-worker caching so authenticated or sensitive responses are never cached.

No session timeout, forced logout, current portal credential format, or financial business logic was changed in this pass.
