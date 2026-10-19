#!/bin/bash
# Uygulama kimliğinde (bundle ID) "Sign in with Apple" yeteneği açık değilse açar.
# Gerekenler: APPLE_API_KEY_P8, APPLE_API_KEY_ID, APPLE_API_ISSUER
set -euo pipefail
cd "$(dirname "$0")/.."
BUNDLE=com.emirhanduran.kurusukurusuna
BID=$(node scripts/asc.js GET "/v1/bundleIds?filter%5Bidentifier%5D=$BUNDLE" | node -pe "JSON.parse(require('fs').readFileSync(0)).data.find(x=>x.attributes.identifier==='$BUNDLE').id")
HAS=$(node scripts/asc.js GET "/v1/bundleIds/$BID/bundleIdCapabilities" | node -pe "JSON.parse(require('fs').readFileSync(0)).data.some(c=>c.attributes.capabilityType==='APPLE_ID_AUTH')")
if [ "$HAS" = "true" ]; then echo "Apple ile giriş yeteneği zaten açık"; exit 0; fi
node scripts/asc.js POST /v1/bundleIdCapabilities "{\"data\":{\"type\":\"bundleIdCapabilities\",\"attributes\":{\"capabilityType\":\"APPLE_ID_AUTH\",\"settings\":[{\"key\":\"APPLE_ID_AUTH_APP_CONSENT\",\"options\":[{\"key\":\"PRIMARY_APP_CONSENT\"}]}]},\"relationships\":{\"bundleId\":{\"data\":{\"type\":\"bundleIds\",\"id\":\"$BID\"}}}}}" > /dev/null
echo "::notice::Apple ile giriş yeteneği açıldı"
