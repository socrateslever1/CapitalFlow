#!/usr/bin/env bash
# Execute localmente em Linux/WSL, nunca no GitHub Actions. A chave nao vai ao Git publico.
set -euo pipefail
umask 077

repository="socrateslever1/CapitalFlow"
signing_dir="${HOME}/.config/capitalflow/android-signing"
keyfile="${signing_dir}/capitalflow-release.jks"
key_alias="capitalflow"

for tool in keytool gh base64; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "ERRO: '$tool' nao esta instalado. Instale Java, GitHub CLI e coreutils (Linux/WSL)." >&2
    exit 1
  fi
done
if ! gh auth status >/dev/null 2>&1; then
  echo 'Entre na sua conta GitHub com: gh auth login' >&2
  exit 1
fi

mkdir -p "$signing_dir"
echo 'Configuracao de assinatura permanente do CapitalFlow.'
echo "A chave privada sera mantida SOMENTE em: $keyfile"
read -r -s -p 'Defina/informe a senha da sua keystore (minimo 16 caracteres): ' CF_SIGN_PASSWORD
printf '\n'
if [[ ${#CF_SIGN_PASSWORD} -lt 16 ]]; then
  echo 'Senha muito curta. Use pelo menos 16 caracteres.' >&2
  exit 1
fi
export CF_SIGN_PASSWORD

if [[ ! -f "$keyfile" ]]; then
  read -r -s -p 'Repita a senha para confirmar: ' confirm
  printf '\n'
  if [[ "$confirm" != "$CF_SIGN_PASSWORD" ]]; then
    echo 'As senhas nao coincidem.' >&2
    exit 1
  fi
  keytool -genkeypair -v -storetype PKCS12 \
    -keystore "$keyfile" -alias "$key_alias" \
    -keyalg RSA -keysize 3072 -validity 10000 \
    -dname 'CN=CapitalFlow Android, OU=Aplicativo, O=CapitalFlow' \
    -storepass:env CF_SIGN_PASSWORD -keypass:env CF_SIGN_PASSWORD \
    -noprompt >/dev/null
  chmod 600 "$keyfile"
else
  echo 'Keystore existente detectada; NAO sera substituida.'
fi

# Antes de publicar, confirmar que a senha realmente corresponde a chave existente.
keytool -list -keystore "$keyfile" -alias "$key_alias" \
  -storepass:env CF_SIGN_PASSWORD >/dev/null

# Transfere a keystore e senhas apenas via GitHub Actions Secrets (HTTPS).
# Nao use echo de segredos em arquivos do repo, scripts ou mensagens.
base64 -w 0 "$keyfile" | gh secret set ANDROID_RELEASE_KEYSTORE_BASE64 -R "$repository"
printf '%s' "$CF_SIGN_PASSWORD" | gh secret set ANDROID_RELEASE_STORE_PASSWORD -R "$repository"
printf '%s' "$key_alias" | gh secret set ANDROID_RELEASE_KEY_ALIAS -R "$repository"
printf '%s' "$CF_SIGN_PASSWORD" | gh secret set ANDROID_RELEASE_KEY_PASSWORD -R "$repository"
unset CF_SIGN_PASSWORD
echo 'Os quatro segredos foram enviados ao GitHub Actions com seguranca.'
echo 'IMPORTANTE: faca backup offline da keystore e da senha. Sem eles, atualizacoes serao impossiveis.'
echo "Local: $keyfile"
gh workflow run android-apk.yml -R "$repository" --ref main
echo 'Compilacao assinada solicitada. Veja GitHub Actions e depois Releases > android-signed-beta.'
