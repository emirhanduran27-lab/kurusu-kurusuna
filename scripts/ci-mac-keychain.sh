#!/bin/bash
# GitHub'ın Mac sunucusunda Developer ID sertifikasını geçici bir anahtar zincirine yükler.
# Gerekenler: APPLE_CSC_P12_BASE64, APPLE_CSC_PASSWORD, RUNNER_TEMP
set -euo pipefail
KC="$RUNNER_TEMP/imza.keychain-db"
KCPW=$(openssl rand -hex 20)
security create-keychain -p "$KCPW" "$KC"
security set-keychain-settings -lut 21600 "$KC"
security unlock-keychain -p "$KCPW" "$KC"
printf '%s' "$APPLE_CSC_P12_BASE64" | base64 --decode > "$RUNNER_TEMP/imza.p12"
security import "$RUNNER_TEMP/imza.p12" -k "$KC" -P "$APPLE_CSC_PASSWORD" -f pkcs12 -T /usr/bin/codesign -T /usr/bin/security -T /usr/bin/productbuild
rm -f "$RUNNER_TEMP/imza.p12"
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KCPW" "$KC" > /dev/null
security list-keychains -d user -s "$KC" $(security list-keychains -d user | tr -d '"')
security find-identity -v -p codesigning "$KC"
