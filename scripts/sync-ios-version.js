// iOS projesindeki sürüm numarasını package.json ile eşitler
const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');
const [maj, min, pat] = version.split('.').map(Number);
const build = maj * 10000 + min * 100 + pat;
const file = path.join(__dirname, '..', 'ios', 'App', 'App.xcodeproj', 'project.pbxproj');
if (!fs.existsSync(file)) process.exit(0);
const src = fs.readFileSync(file, 'utf8')
  .replace(/MARKETING_VERSION = [^;]+;/g, `MARKETING_VERSION = ${version};`)
  .replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, `CURRENT_PROJECT_VERSION = ${build};`);
fs.writeFileSync(file, src);
console.log(`iOS sürümü: ${version} (${build})`);
