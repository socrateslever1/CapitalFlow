# Análise rápida do pacote (minhasfinancas)

## O que este pacote aparenta ser
- O conteúdo do repositório está no formato de **APK extraído/decompilado** (arquivos como `classes.dex`, `resources.arsc`, `AndroidManifest.xml` binário, `res/` e `META-INF/`).
- Não há projeto-fonte Android (ex.: `app/build.gradle`, `src/main/java`), então a análise é de artefato compilado.

## Evidências coletadas
- `AndroidManifest.xml` está em formato binário AXML (não legível diretamente em XML texto).
- O identificador de app encontrado em strings do manifesto é `cicero.minhasfinancas`.
- Foram encontrados muitos indícios de SDKs/serviços: Firebase, Google Play Services, WorkManager, Room, Ktor, OkHttp e Billing.
- O app solicita permissões sensíveis esperadas para app financeiro, incluindo internet, notificações, câmera e calendário.
- O pacote contém SQLs de domínio financeiro em `assets/SQL/*` (despesas, receitas, cartões, objetivos, contas etc.), indicando forte uso de banco local e regras embarcadas.
- Há bases SQLite em `assets/databases/`, sugerindo dados/schemas empacotados para uso local.

## Descompactação dos `.dex`
- Foi possível **descompactar os `.dex` em nível estrutural** (extração de índice de classes), sem depender de ferramentas externas.
- Resultado salvo em `DEX_UNPACK_SUMMARY.md`.
- Totais encontrados:
  - 6 arquivos DEX;
  - 50.132 classes únicas;
  - forte presença de classes próprias `cicero.minhasfinancas.*` + bibliotecas Google/Firebase.
- Script utilizado: `scripts/extrair_classes_dex.py`.

> Observação: isso **não** substitui decompilação Java/Kotlin completa (jadx/apktool), mas já permite mapear superfície funcional e pacotes críticos.

## Pontos de atenção
1. **Superfície de ataque por funcionalidades amplas**  
   Permissões e integrações diversas aumentam o risco operacional caso falte hardening (exported components, validação de intents, etc.).

2. **Chaves e identificadores embarcados**  
   Há presença de identificadores públicos (como chave de API do ecossistema Google/Firebase no manifesto binário via strings). Chaves públicas são comuns em mobile, mas devem estar restritas no backend/console.

3. **Dados financeiros locais**  
   Como há SQL e DBs locais, vale validar criptografia em repouso, proteção de backup e política de logs para evitar exposição de PII.

4. **Sem código-fonte legível neste pacote**  
   Sem classes Java/Kotlin de origem, não dá para auditar com precisão controles de autenticação, criptografia aplicada e validação de entrada.

## Recomendações práticas (prioridade)
1. **Gerar manifesto legível e inventário de componentes** (activities/services/receivers/providers + `exported=true`).
2. **Executar varredura estática de segurança em APK** (ex.: MobSF / QARK / semgrep em código, quando disponível).
3. **Revisar controles de dados sensíveis**:
   - criptografia de banco/arquivos;
   - uso de Android Keystore;
   - logs sem dados pessoais;
   - política de backup e restauração.
4. **Auditar integrações de terceiros** (Firebase/Ads/Billing) com princípio de menor privilégio.
5. **Validar conformidade LGPD** (consentimento, retenção, minimização e exclusão de dados).

## Limitações desta análise
- Esta é uma análise estrutural de artefato compilado.
- Para laudo de segurança mais assertivo, é necessário:
  - decompilar classes (`jadx`/`apktool`) e revisar fluxos críticos;
  - executar testes dinâmicos (runtime, interceptação TLS, storage inspection);
  - correlacionar com backend/API.


## Estrutura de páginas (lógica navegacional)
- Foi gerado o relatório `PAGINAS_E_ESTRUTURA.md` para mapear a arquitetura de telas.
- Resultado objetivo:
  - 169 `Activity`;
  - 41 `Fragment`;
  - 45 `Dialog/DialogFragment`;
  - módulos claros como `activity.menu`, `activity.configuracao`, `activity.orcamentos`, `activity.cartao_credito`, `activity.conta`.
- Isso permite entender a **lógica de organização e navegação** das páginas, mesmo sem recuperar todos os detalhes de implementação de métodos.
