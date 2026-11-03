# Otimização de chaves estrangeiras da Carteira — 03/11/2026

Foram identificadas 24 FKs da Carteira sem índice de cobertura no Supabase Advisor. Esta entrega prioriza 12 relacionamentos de operações bancárias, faturas, cartões e despesas, com índices dedicados nos campos referenciais. Nenhum índice de autenticação, unicidade ou de regra contábil é removido.

A criação é idempotente e restrita às tabelas examinadas. O teste de implantação deve conferir a presença das colunas indexadas, a redução de alertas e a ausência de erros de regressão. Não estender automaticamente os 12 índices restantes sem medição de consultas.
