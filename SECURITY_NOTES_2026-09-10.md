# CapitalFlow security hardening — 2026-09-10

This pass intentionally preserves the current login/session behavior. Supabase Auth sessions are not given an inactivity timeout or forced lifetime here; users remain signed in until they explicitly sign out or Supabase invalidates the session for another reason.

## Changes applied

- Removed anonymous/authenticated execution from legacy ID-only portal RPC overloads that returned client, contract, installment or signal data without the current token + shortcode credential pair.
- Removed anonymous execution from agreement schedule editing and source deletion/archive RPCs; authenticated access remains.
- Removed anonymous/authenticated execution from the legacy payment-intent RPC that accepted arbitrary client/loan/profile IDs.
- Current portal RPC overloads using token + shortcode remain untouched.

## Next audit priorities

- Review SECURITY DEFINER financial/admin RPCs one by one for ownership checks before changing grants.
- Review admin password-reset RPC authorization.
- Review portal token/shortcode rate limiting and brute-force resistance.
- Review service-worker caching so authenticated or sensitive responses are never cached.

No access model, login persistence, current portal credentials, or financial business logic was changed in this pass.
