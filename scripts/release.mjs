#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const ROOT_PKG_PATH = path.join(ROOT_DIR, 'package.json');
const WEBAPP_PKG_PATH = path.join(ROOT_DIR, 'webapp', 'package.json');
const ROOT_VERSION_PATH = path.join(ROOT_DIR, 'version.json');
const WEBAPP_RELEASE_INFO_PATH = path.join(ROOT_DIR, 'webapp', 'src', 'lib', 'release-info.json');

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT_DIR, stdio: 'pipe', encoding: 'utf-8', ...opts });
}

function runInteractive(cmd) {
  execSync(cmd, { cwd: ROOT_DIR, stdio: 'inherit' });
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    buildNumber: null,
    version: null,
    message: null,
    yes: false,
    dryRun: false,
    skipPush: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--build' || arg === '-b') {
      options.buildNumber = parseInt(args[++i], 10);
    } else if (arg === '--version' || arg === '-v') {
      options.version = args[++i];
    } else if (arg === '--message' || arg === '-m') {
      options.message = args[++i];
    } else if (arg === '--yes' || arg === '-y') {
      options.yes = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--skip-push') {
      options.skipPush = true;
    }
  }

  return options;
}

function bumpPatch(version) {
  const parts = version.split('.');
  if (parts.length === 3) {
    const patch = parseInt(parts[2], 10);
    if (!Number.isNaN(patch)) {
      return `${parts[0]}.${parts[1]}.${patch + 1}`;
    }
  }
  return version;
}

function getRepoSlug() {
  try {
    const remote = run('git remote get-url origin').trim();
    const match = remote.match(/[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
    if (match) return match[1];
  } catch {
    // fallback
  }
  return 'axjh03/Astra';
}

function getGitBranch() {
  try {
    return run('git branch --show-current').trim() || 'main';
  } catch {
    return 'main';
  }
}

async function main() {
  const cliOptions = parseArgs();

  // Load root package.json
  const rootPkg = JSON.parse(fs.readFileSync(ROOT_PKG_PATH, 'utf-8'));
  const currentVersion = rootPkg.version || '0.1.0';

  // Load root version.json or initialize
  let currentBuildNumber = 1;
  let lastReleaseDate = 'Initial release';
  if (fs.existsSync(ROOT_VERSION_PATH)) {
    try {
      const vData = JSON.parse(fs.readFileSync(ROOT_VERSION_PATH, 'utf-8'));
      if (typeof vData.buildNumber === 'number') currentBuildNumber = vData.buildNumber;
      if (vData.releaseDate) lastReleaseDate = vData.releaseDate;
    } catch {
      // ignore
    }
  }

  const defaultNextBuildNumber = currentBuildNumber + 1;
  const defaultNextVersion = bumpPatch(currentVersion);
  const repoSlug = getRepoSlug();
  const gitBranch = getGitBranch();

  console.log('\n============================================================');
  console.log('              NOVI RELEASE & GITHUB PUSH');
  console.log('============================================================');
  console.log(` Last Build Number:   #${currentBuildNumber}`);
  console.log(` Current Version:     v${currentVersion}`);
  console.log(` Last Update Date:    ${lastReleaseDate}`);
  console.log(` Git Branch:          ${gitBranch}`);
  console.log(` Target Repository:   ${repoSlug}`);
  console.log('============================================================\n');

  let chosenBuildNumber = cliOptions.buildNumber;
  let chosenVersion = cliOptions.version;
  let chosenMessage = cliOptions.message;

  const rl = readline.createInterface({ input, output });

  try {
    if (!chosenBuildNumber) {
      const ans = await rl.question(`Enter build number [default: ${defaultNextBuildNumber}]: `);
      const trimmed = ans.trim();
      chosenBuildNumber = trimmed ? parseInt(trimmed, 10) : defaultNextBuildNumber;
      if (Number.isNaN(chosenBuildNumber) || chosenBuildNumber <= 0) {
        console.error('Invalid build number! Must be a positive integer.');
        process.exit(1);
      }
    }

    if (!chosenVersion) {
      const ans = await rl.question(`Enter version (SemVer) [default: ${defaultNextVersion}]: `);
      const trimmed = ans.trim();
      chosenVersion = trimmed ? trimmed.replace(/^v/, '') : defaultNextVersion;
    }

    const defaultMessage = `Release v${chosenVersion} (build #${chosenBuildNumber})`;
    if (!chosenMessage) {
      const ans = await rl.question(`Enter release notes / commit message [default: "${defaultMessage}"]: `);
      const trimmed = ans.trim();
      chosenMessage = trimmed || defaultMessage;
    }

    const now = new Date();
    const formattedDate = now.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    const isoDate = now.toISOString();
    const tagName = `v${chosenVersion}`;

    console.log('\nSummary of Planned Changes:');
    console.log('------------------------------------------------------------');
    console.log(` • New Build Number:      #${chosenBuildNumber}`);
    console.log(` • New Version:           ${chosenVersion}`);
    console.log(` • Git Tag:               ${tagName}`);
    console.log(` • Last Update Date:      ${formattedDate}`);
    console.log(` • Commit Message:        chore(release): v${chosenVersion} (build #${chosenBuildNumber}) - ${chosenMessage}`);
    console.log(` • Download Links:        Updated in webapp/src/lib/release-info.json`);
    console.log(` • GitHub Action:         Will trigger on push of ${tagName}`);
    console.log('------------------------------------------------------------');

    if (!cliOptions.yes) {
      const confirm = await rl.question('\nProceed with bumping version, updating frontend, and pushing to GitHub? (Y/n): ');
      if (confirm.trim().toLowerCase() === 'n') {
        console.log('Release aborted by user.');
        process.exit(0);
      }
    }

    if (cliOptions.dryRun) {
      console.log('\n[Dry Run] No files modified or pushed.');
      process.exit(0);
    }

    // 1. Update root package.json
    rootPkg.version = chosenVersion;
    fs.writeFileSync(ROOT_PKG_PATH, JSON.stringify(rootPkg, null, 2) + '\n', 'utf-8');
    console.log(`✓ Updated ${ROOT_PKG_PATH}`);

    // 2. Update webapp/package.json
    if (fs.existsSync(WEBAPP_PKG_PATH)) {
      const webappPkg = JSON.parse(fs.readFileSync(WEBAPP_PKG_PATH, 'utf-8'));
      webappPkg.version = chosenVersion;
      fs.writeFileSync(WEBAPP_PKG_PATH, JSON.stringify(webappPkg, null, 2) + '\n', 'utf-8');
      console.log(`✓ Updated ${WEBAPP_PKG_PATH}`);
    }

    // 3. Update root version.json
    const rootVersionData = {
      version: chosenVersion,
      buildNumber: chosenBuildNumber,
      releaseTag: tagName,
      releaseDate: formattedDate,
      updatedAt: isoDate,
      repo: repoSlug,
      releaseNotes: chosenMessage
    };
    fs.writeFileSync(ROOT_VERSION_PATH, JSON.stringify(rootVersionData, null, 2) + '\n', 'utf-8');
    console.log(`✓ Updated ${ROOT_VERSION_PATH}`);

    // 4. Update webapp/src/lib/release-info.json
    const releaseInfo = {
      version: chosenVersion,
      buildNumber: chosenBuildNumber,
      releaseTag: tagName,
      releaseDate: formattedDate,
      updatedAt: isoDate,
      repo: repoSlug,
      releaseNotes: chosenMessage,
      downloads: {
        macArm64: `https://github.com/${repoSlug}/releases/download/${tagName}/Novi-${chosenVersion}-arm64.dmg`,
        macX64: `https://github.com/${repoSlug}/releases/download/${tagName}/Novi-${chosenVersion}-x64.dmg`,
        windows: `https://github.com/${repoSlug}/releases/download/${tagName}/Novi-Setup-${chosenVersion}.exe`,
        linuxDeb: `https://github.com/${repoSlug}/releases/download/${tagName}/novi_${chosenVersion}_amd64.deb`,
        linuxAppImage: `https://github.com/${repoSlug}/releases/download/${tagName}/Novi-${chosenVersion}.AppImage`
      },
      fileNames: {
        macArm64: `Novi-${chosenVersion}-arm64.dmg`,
        macX64: `Novi-${chosenVersion}-x64.dmg`,
        windows: `Novi-Setup-${chosenVersion}.exe`,
        linuxDeb: `novi_${chosenVersion}_amd64.deb`,
        linuxAppImage: `Novi-${chosenVersion}.AppImage`
      }
    };
    fs.mkdirSync(path.dirname(WEBAPP_RELEASE_INFO_PATH), { recursive: true });
    fs.writeFileSync(WEBAPP_RELEASE_INFO_PATH, JSON.stringify(releaseInfo, null, 2) + '\n', 'utf-8');
    console.log(`✓ Updated ${WEBAPP_RELEASE_INFO_PATH}`);

    // 5. Git Stage, Commit, Tag, Push
    console.log('\nStaging files for git...');
    runInteractive('git add .');

    const commitMsg = `chore(release): v${chosenVersion} (build #${chosenBuildNumber}) - ${chosenMessage}`;
    console.log(`Committing: ${commitMsg}`);
    runInteractive(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

    // Check if tag already exists
    let tagExists = false;
    try {
      const existingTags = run('git tag -l').split('\n').map(t => t.trim());
      tagExists = existingTags.includes(tagName);
    } catch {
      // ignore
    }

    if (tagExists) {
      console.log(`Tag ${tagName} already exists locally. Updating tag...`);
      runInteractive(`git tag -fa ${tagName} -m "Release v${chosenVersion} (Build #${chosenBuildNumber})"`);
    } else {
      console.log(`Creating git tag ${tagName}...`);
      runInteractive(`git tag -a ${tagName} -m "Release v${chosenVersion} (Build #${chosenBuildNumber})"`);
    }

    if (cliOptions.skipPush) {
      console.log('\n[Skip Push] Committed and tagged locally. Run `git push origin HEAD --tags` when ready.');
      process.exit(0);
    }

    console.log(`\nPushing to GitHub: origin ${gitBranch} and tag ${tagName}...`);
    runInteractive(`git push origin ${gitBranch}`);
    runInteractive(`git push origin ${tagName} --force`);

    console.log('\n============================================================');
    console.log('              🎉 RELEASE PUSH SUCCESSFUL!');
    console.log('============================================================');
    console.log(` • Version:           v${chosenVersion} (Build #${chosenBuildNumber})`);
    console.log(` • Last Update Date:  ${formattedDate}`);
    console.log(` • Tag Pushed:        ${tagName}`);
    console.log(` • Actions CI/CD:     https://github.com/${repoSlug}/actions`);
    console.log(` • GitHub Release:    https://github.com/${repoSlug}/releases/tag/${tagName}`);
    console.log(` • Downloads Page:    Frontend metadata updated with version and date.`);
    console.log('============================================================\n');

  } finally {
    rl.close();
  }
}

main().catch((err) => {
  console.error('\nRelease failed with error:', err);
  process.exit(1);
});
