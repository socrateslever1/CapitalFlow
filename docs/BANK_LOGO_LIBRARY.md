# Banco de logos local — CapitalFlow

21 logos SVG de instituições brasileiras incorporados ao bundle Vite, sem solicitar imagens de servidores externos ao abrir a carteira.

Fonte de referência: [rzmt/logos-bancos-br](https://github.com/rzmt/logos-bancos-br), instituição associada ao seu ISPB. Conferir `assets/BANK_LOGOS_LICENSE.txt`. As marcas continuam pertencendo aos respectivos titulares.

## Fluxo
- Biblioteca: `assets/bankLogoAssetsA.ts` / `assets/bankLogoAssetsB.ts`.
- Registro: `utils/bankLogoRegistry.ts`, correspondência explícita (sem fuzzy perigoso).
- Componente: `components/wallet/BankLogo.tsx`.
- Contas e cartões: resolução automática pelo banco/emissor, com imagem personalizada prioritária.
- Bancos desconhecidos: iniciais genéricas, sem logo inventado.
- Cadastro/edição: sugestões locais pelo catálogo, sem chamadas HTTP.
- Nenhum SQL, pagamento, contrato, recebimento, estorno ou migration foi alterado.

## Atualização
Logos não são atualizados silenciosamente por terceiros. Para atualizar, conferir o ISPB e a marca, verificar o novo SVG quanto a scripts/referências externas e versionar o conteúdo.
