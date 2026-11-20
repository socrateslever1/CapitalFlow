---
name: qualidade-e-seguranca
description: Audite uma alteração antes do merge para localizar regressões, falhas de validação, vulnerabilidades, problemas de desempenho e cobertura insuficiente.
---

1. Identificar componentes alterados e superfícies de ataque reais; limitar análise às evidências coletadas.
2. Inspecionar entradas, saídas, autenticação, autorização, RLS, logs, erros e acesso a segredos.
3. Revisar casos limites: nulos, formatos, precisão monetária, timezone, duplicações, concorrência e falhas de rede.
4. Rodar linters, typecheck, testes de unidade/integração, E2E, testes de segurança aplicáveis e build se disponíveis.
5. Revisar UI visual e acessibilidade quando houver interface.
6. Entregar achados por severidade, com caminho, repro e correção sugerida; distinguir teste executado de inferência técnica.
7. Não aprovar se um requisito bloqueante estiver sem evidência.
