# Links públicos Android e Cloudflare

A origem local `https://localhost` do Capacitor não pode ser compartilhada com clientes.
Usar `buildPublicAppUrl` para portal, cadastro, links jurídicos e QR de verificação;
`https://capflow.pages.dev` é a origem pública canônica, substituível no BUILD por
`VITE_PUBLIC_APP_ORIGIN` HTTPS válido (nunca localhost).
Não alterar tokens ou códigos armazenados e não reescrever URLs HTTPS de Storage assinadas.
PR #88 de alinhamento lateral é independente. Sem migrações no Supabase.
Testar CI web/Android, lançamento da release assinada e publicação Cloudflare antes de declarar produção.
