---
name: raciocinio-computacional
description: Estruture problemas técnicos difíceis em estados, invariantes, algoritmos e verificações antes de implementar. Use em regras de negócio complexas, concorrência, cálculos financeiros, fluxos de navegação e decisões de arquitetura.
---

1. Definir entradas, saídas, pré-condições, pós-condições, efeitos colaterais e fronteiras de confiança.
2. Representar o fluxo como estados e transições (ou sequência de eventos), incluindo erro, retry, cancelamento, timeout e acesso concorrente.
3. Registrar invariantes impossíveis de violar, por exemplo não duplicar transações, não perder histórico e não permitir acesso entre usuários.
4. Examinar alternativas concretas e trade-offs de complexidade temporal, espacial, custo operacional, testabilidade e manutenção.
5. Separar hipóteses de evidências, identificar ambiguidades e comparar com código, dados e contratos reais.
6. Criar casos de teste para bordas, precisão, idempotência e estados não felizes antes da implementação.
7. Implementar apenas após explicitar o mecanismo de verificação e provar compatibilidade com integrações e fluxos existentes.
8. Não tratar a sequência narrativa de raciocínio do modelo como memória confiável: documentar decisões, resultados de testes e evidências no repositório.
