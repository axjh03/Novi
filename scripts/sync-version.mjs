import fs from 'node:fs';

const tag = process.env.GITHUB_REF_NAME || '';
const clean = tag.replace(/^v/, '').trim();
if (/^\d+\.\d+\.\d+/.test(clean)) {
  const pkgPath = 'package.json';
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.version = clean;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`[VersionSync] Synchronized package.json version to ${clean}`);
} else {
  console.log(`[VersionSync] No tag to synchronize (tag: "${tag}"). Keeping package.json version.`);
}
