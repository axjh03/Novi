import fs from 'node:fs';

// Only synchronize when explicitly specified via environment (e.g. GitHub Actions or release script)
const tag = process.env.TAG_NAME || process.env.GITHUB_REF_NAME || '';
const clean = tag.replace(/^v/, '').trim();

if (/^\d+\.\d+\.\d+/.test(clean)) {
  const pkgPaths = ['package.json', 'webapp/package.json'];
  for (const pkgPath of pkgPaths) {
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.version !== clean) {
        pkg.version = clean;
        fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
        console.log(`[VersionSync] Updated ${pkgPath} version to ${clean}`);
      }
    }
  }
}
