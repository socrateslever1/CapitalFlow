# V5 financial / AI / Android hardening — controlled release

## Finance
- Reproduce the seven hard invariants using `private.financial_integrity_report()`.
- Use `scripts/financial-legacy-audit.sql` to count and investigate agreement payment anomalies.
- Never infer duplicate payments from count alone. Collect authorized per-case reconciliation before any correction.
- No production contract, installment, payment, account balance, or ledger row is mutated in this release.

## AI
- Three multi-turn security traces now execute with the existing static routing eval suite.
- Confirmation cannot bypass identity; expired state is invalidated; financial write routes remain shadow-blocked.
- Further work: authenticated end-to-end conversation persistence with live multi-tenant tests, skill profitability ledger reconciliation, and observations/alerts against real n8n traffic.

## Android
- Android workflow runs `test:quality` before building the APK, verifies the artifact, and publishes its SHA-256.
- APK is debug/test only. Release signing, keystore management, navigation/deep links, camera, permission checks and physical-device tests remain pending.
- Production-ready Android must not be claimed until tested on a real device.

## Release acceptance
- Quality Gates and load-smoke workflows green on the exact PR head.
- Run the read-only finance report after merge; do not hide the three legacy review findings.
- Android workflow build status requires separate confirmation; workflow configuration is not evidence of an installed APK.
