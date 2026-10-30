# Cadastro completo e padrão visual da Carteira

Preservar os ajustes locais do Dashboard e os RPCs financeiros existentes. Usar PageHeader, ícone circular e gutters do padrão de Clientes. Eliminar o Cancelar duplicado do cadastro de cartão sem alterar o Modal global.

1. Implementar validação e criptografia Web Crypto para número completo/CVC. Senha própria, PBKDF2-SHA256/AES-GCM, salt/IV aleatórios, contexto por proprietário/registro. Nenhum PAN/CVC/senha em notes, logs, storage local ou snapshot geral.
2. Criar armazenamento de envelopes criptografados com RLS e acesso via RPC autenticada por proprietário. Envolver o cadastro financeiro canônico em uma transação, mantendo saldos iniciais e idempotência. Preservar cartões existentes sem dados protegidos.
3. Completar o cadastro com titular, validade e dados protegidos; permitir consultar/editar no cofre e copiar campos explicitamente. Preservar scanner, importação, extrato, pagamentos e edição financeira.
4. Adicionar dados bancários e produtos opcionais por componente compartilhado entre criação e edição da conta. Valores de cheque especial/empréstimos são informativos e não entram no saldo nem geram obrigações.
5. Validar criptografia, adulteração/senha incorreta, isolamento SQL, repetição/rollback, cadastro/edição e renderização. Executar testes da Carteira, tipos, build e diff. Registrar separadamente implantação e validação visual.
