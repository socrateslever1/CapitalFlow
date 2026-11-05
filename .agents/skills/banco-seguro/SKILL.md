---
name: banco-seguro
description: Planeje mudanças de schema e consultas com integridade, compatibilidade, autorização e reversão. Use para migrations, APIs de persistência, Supabase ou PostgreSQL.
---

1. Inspecionar schema real, migrations existentes, constraints, políticas RLS, índices, dependentes e transações.
2. Não presumir que coluna ou função existe; verificar compatibilidade entre código em produção e schema futuro.
3. Definir estratégia de expansão e contração para mudanças incompatíveis, com migração incremental e monitoramento.
4. Testar autorização por usuário/perfil, dados inválidos, concorrência, idempotência e integridade referencial.
5. Nunca executar migração destrutiva, alterar dados reais de teste, desativar RLS ou apagar tabelas sem autorização explícita e backup validado.
6. Documentar rollback ou plano de recuperação real; rollback automático nem sempre é possível para dados.
7. Bloquear publicação caso existam incompatibilidades, perda potencial de dados ou ausência de testes críticos.
