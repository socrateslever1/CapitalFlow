# CapitalFlow V5 — produção e critérios de encerramento

## Itens homologados via automação
- Nenhuma alteração no Motor V4 foi efetuada por esta entrega.
- O auditor compara componentes de operações finalizadas com valores recebidos e identifica estornos sem operação original.
- `scripts/finance-profitability-audit.sql` é somente leitura e não pode corrigir anomalias automaticamente.
- O workflow Android gera o APK **debug**, valida a integridade ZIP, presença de manifesto e dex, assinatura do APK e arquivo SHA-256.
- CI de qualidade e smoke-test web são pré-condições para integrar a `main`.

## Etapas ainda dependentes de homologação
- Resolver as três ocorrências históricas exige reconciliação por caso, sem reconstruir saldos por suposição.
- Testar modalidades e calendário com casos reais autorizados, incluindo primeira parcela, fins de semana e renegociações.
- Reconciliar `skill_get_profitability_v1` com o ledger em múltiplos contratos e períodos.
- Homologar State Machine e contextos autenticados em conversas reais com múltiplas mensagens e perfis.
- Assinatura de **release** e teste de instalação Android em dispositivo físico; APK debug **não** significa liberação para loja.
- Confirmar o deployment Cloudflare em produção e teste visual/autenticado web/mobile.
- Skills executoras permanecem bloqueadas até autorização e auditoria financeira completa.

## Regras
Sem exclusão ou ajuste destrutivo de contratos, parcelas, recebimentos e estornos.
Nunca usar credenciais de serviço Supabase no frontend ou APK.
Não interpretar o sucesso de um commit como prova de deploy ou homologação.
