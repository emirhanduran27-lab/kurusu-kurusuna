// Telefon projelerini günceller: node scripts/mobile-sync.js [ios|android]
// iPhone için köprü ayrıca derlenir, Android'e özgü güncelleme kodu iPhone paketine girmez.
const { execSync } = require('child_process');
const platform = process.argv[2] || '';
const run = cmd => execSync(cmd, { stdio: 'inherit' });
run('npm run bridge');
if (platform === 'ios') {
  run('npx esbuild mobile/bridge.js --bundle --format=iife --minify --target=es2020 --define:__KK_IOS__=true --outfile=renderer/vendor/mobile-bridge.js');
}
run('node scripts/sync-ios-version.js');
run('npx cap sync' + (platform ? ' ' + platform : ''));
if (platform === 'ios') run('npm run bridge'); // depodaki ortak köprü genel sürümde kalsın
