# Migrações arquivadas

`untracked/` contém scripts históricos que existiam no repositório, mas não
constam em `supabase_migrations.schema_migrations` do projeto remoto.

Eles ficam fora de `supabase/migrations` para impedir reaplicação acidental.
Não os marque como aplicados sem comparar o estado e o conteúdo no banco.
