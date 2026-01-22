import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const version = process.argv[2];
if (!version) {
  console.error('No version provided');
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

// Sync manifest.json
const manifestPath = path.join(root, 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, '\t') + '\n');
  console.log(`Updated manifest.json to ${version}`);
}

// Sync versions.json
const versionsPath = path.join(root, 'versions.json');
if (fs.existsSync(versionsPath)) {
  const versions = JSON.parse(fs.readFileSync(versionsPath, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  versions[version] = manifest.minAppVersion || '0.15.0';
  fs.writeFileSync(versionsPath, JSON.stringify(versions, null, '\t') + '\n');
  console.log(`Updated versions.json with ${version}`);
}
