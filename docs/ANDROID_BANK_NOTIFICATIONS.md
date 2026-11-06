# Captura de notificações bancárias — Android

## Objetivo e limites
O módulo `WalletBankNotifications` é nativo Android, **opt-in** e isolado da LLM.
O Android requer autorização manual em **Configurações > Acesso a notificações**.
A permissão é abrangente no sistema operacional: o serviço pode receber notificações de vários apps,
mas o código descarta todas imediatamente, exceto as dos pacotes explicitamente selecionados.
Mesmo nesses apps, só considera textos com indicação de despesa e quantia monetária.

Suporte inicial: Nubank (`com.nu.production`), C6 (`com.c6bank.app`), Inter (`br.com.intermedium`),
PicPay (`com.picpay`) e Mercado Pago (`com.mercadopago.wallet`). Os nomes de pacotes foram
verificados em listagens da Play Store, mas a redação das notificações muda sem aviso.

## Funcionamento
1. Entrar no CapitalFlow e abrir **Minha Carteira > + > Notificações bancárias**.
2. Selecionar os bancos que deseja monitorar; tocar em **Configurar no Android** e autorizar o CapitalFlow.
3. Habilitar **Capturar sugestões de despesas**.
4. Fazer uma compra real de teste no aplicativo de um dos bancos permitidos, com notificação ativada.
5. Voltar ao CapitalFlow; a sugestão aparece com banco, valor, tipo provável e data.
6. Selecionar **Conferir lançamento**; confirmar conta ou cartão, tipo, data, categoria e valor.
7. Somente ao confirmar no formulário existente é que a despesa será escrita via RPCs existentes.

O módulo nativo processa notificações recebidas com serviço ligado, sem consultar Supabase.
Códigos de autenticação, login, saldos, receitas, estornos, avisos e ofertas são ignorados por
filtros conservadores. Não há garantia de reconhecimento de todos os formatos, compras por SMS
ou notificações ocultas por configurações de privacidade. A captura não lê o histórico anterior
à autorização, apenas eventos futuros. Android/ROM podem limitar a entrega em segundo plano.

## Segurança
- Não solicita leitura de SMS nem permissão de acessibilidade.
- Não armazena texto bruto, número completo de cartão, remetentes, OTP ou credenciais.
- Persiste somente hash do evento, pacote, nome da instituição, modo provável,
  data e centavos em uma fila **AES-256-GCM / Android Keystore**.
- Até 40 sugestões, retenção de no máximo 72 horas, com filtro de repetição.
- Dados não são transmitidos para a Edge Function, LLM ou Supabase.
- A sessão é vinculada ao perfil autenticado; troca de perfil/logout desativa captura
  e destrói a fila anterior.
- Se não houver autorização, opt-in ou bancos autorizados, **não captura nada**.
- Valor ou banco da notificação nunca bastam para registrar, pagar ou reconciliar uma transação.
- A idempotência do formulário usa identificador estável derivado do hash do evento para impedir
  lançamento duplicado no fluxo de confirmação; conferência cruzada de extratos continua necessária.

## Arquivos
- `native/android/WalletBankNotificationStore.java`: classificação, armazenamento cifrado, limpeza, deduplicação.
- `native/android/WalletBankNotificationListenerService.java`: callback do Android.
- `native/android/WalletBankNotificationsPlugin.java`: bridge Capacitor.
- `scripts/android/apply-native-shell.py`: montagem nativa e manifesto.
- `features/wallet/bankNotificationsBridge.ts`: API tipada JS.
- `features/wallet/pages/WalletBankNotificationsPage.tsx`: consentimento, seletor de bancos, fila, revisão.
- `components/wallet/QuickExpenseModal.tsx`: pré-preenchimento sem auto-salvamento.
- `tests/architecture/android-bank-notifications.test.mjs`: verificação dos limites e integração.

## Homologação
Verificar `test:bank-notifications`, `test:quality`, compilação Android e assinatura.
Testes de fluxo real devem ser feitos em um dispositivo físico com perfil autenticado:
permissão recusada, concedida e revogada; tela em segundo plano; banco não selecionado;
notificação de compra versus OTP/PIX recebido; repetição; troca de usuário; revisão com
seleção de destino e conferência de duplicidades. Nada foi ativado no aparelho remotamente.
