# Guia de Testes - Refatoração Cirúrgica CapitalFlow

Este guia orienta como validar as mudanças realizadas hoje, garantindo que a arquitetura e a UX estejam conforme o padrão Master Sênior.

## 1. Validação de Camadas (Z-Index)
**Objetivo**: Garantir que as camadas do sistema não se sobreponham de forma errada.
- **Passo 1**: Abra o **Chat de Suporte** (FAB no canto inferior direito).
- **Passo 2**: Dispare um **Toast** (ex: faça uma ação ou espere uma notificação). O Toast deve aparecer **sobre** o chat.
- **Step 3**: Abra um **Modal** (ex: Gerar novo contrato). O Modal deve aparecer **sobre** o chat, mas **sob** o Toast.
- **Resultado esperado**: Toast (3000) > Modal (2000) > Chat de Suporte (2500) --- *Ajuste real realizado: o suporte agora fica entre modais e layouts de base.*

## 2. Validação do Chat (Navegação & UX)
**Objetivo**: Confirmar que o chat é navegável em desktop e bem organizado.
- **Passo 1**: No portal do cliente, abra o chat.
- **Passo 2**: Verifique se o botão de **Voltar (ChevronLeft)** agora está visível no topo da área de chat em telas de desktop.
- **Passo 3**: Envie mensagens em dias diferentes (ou simule mensagens antigas).
- **Resultado esperado**: As mensagens devem estar agrupadas por separadores de data ("segunda-feira", "hoje", etc) e sequências do mesmo autor devem ter espaçamento reduzido.

## 3. Validação do Cartão de Empréstimo (Dashboard)
**Objetivo**: Validar a nova estética e a precisão dos dados.
- **Passo 1**: Localize um contrato com atraso ou juros acumulados.
- **Passo 2**: Verifique se o valor exibido no **Header** é o "Total" (Saldo Real) e não apenas o principal.
- **Passo 3**: Expanda o card e verifique se as informações de **Ciclo de Faturamento** e **ID do Contrato** aparecem como subtítulo.
- **Passo 4**: Verifique a aparência dos **Contratos Unificados** e do **Banner de Acordo** (devem possuir gradientes e bordas suaves).

## 4. Validação de Build
**Comando**: `npx tsc --noEmit`
- **Resultado esperado**: "Found 0 errors".
