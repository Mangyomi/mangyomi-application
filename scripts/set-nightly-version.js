/**
 * Sets the nightly version in package.json
 * Usage: node scripts/set-nightly-version.js
 * 
 * Outputs: nightly_version=X.Y.Z-nightly.TIMESTAMP to GitHub Actions
 */

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');

// Read package.json
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));

// Extract base version (strip any existing -nightly suffix)
const baseVersion = pkg.version.replace(/-nightly\.\d+.*$/, '');

// Generate timestamp
const now = new Date();
const timestamp = now.toISOString()
    .replace(/[-:T]/g, '')
    .slice(0, 12)
    .replace(/(\d{8})(\d{4})/, '$1.$2');

// Create nightly version
const nightlyVersion = `${baseVersion}-nightly.${timestamp}`;

// Update package.json
pkg.version = nightlyVersion;
fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

// Verify it was written correctly
const verify = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
console.log(`=== VERSION SET ===`);
console.log(`Base version: ${baseVersion}`);
console.log(`Nightly version: ${nightlyVersion}`);
console.log(`Verified in package.json: ${verify.version}`);

if (verify.version !== nightlyVersion) {
    console.error('ERROR: Version mismatch after write!');
    process.exit(1);
}

// Output for GitHub Actions
if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `nightly_version=${nightlyVersion}\n`);
}

// Also update installer Cargo.toml version
const cargoPath = path.join(__dirname, '..', 'installer', 'src-tauri', 'Cargo.toml');
if (fs.existsSync(cargoPath)) {
    let cargo = fs.readFileSync(cargoPath, 'utf8');
    // Cargo.toml version must be semver (no -nightly suffix allowed in some cases)
    // Use base version for Cargo to avoid issues, the actual version shown is from package.json
    cargo = cargo.replace(/^version = ".*"$/m, `version = "${baseVersion}"`);
    fs.writeFileSync(cargoPath, cargo, 'utf8');
    console.log(`Updated installer Cargo.toml to version: ${baseVersion}`);
}

console.log('Version set successfully!');
