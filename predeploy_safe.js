const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');

const roots = [
  path.join(__dirname, 'assets'),
  path.join(__dirname, 'dist_clean', 'assets'),
];

function runEncodingValidation() {
  const result = spawnSync(process.execPath, [path.join(__dirname, 'validate_encoding.js')], {
    stdio: 'inherit',
  });
  return result.status === 0;
}

function listFiles(startDir) {
  const out = [];
  if (!fs.existsSync(startDir)) return out;
  const stack = [startDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(full);
      if (ent.isFile()) out.push(full);
    }
  }
  return out;
}

function sha256File(filePath) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(filePath));
  return h.digest('hex');
}

function writeManifest() {
  const stamp = new Date().toISOString().replace(/[:]/g, '-');
  const manifestPath = path.join(__dirname, `deploy-manifest-${stamp}.txt`);
  const lines = [];

  for (const root of roots) {
    for (const file of listFiles(root)) {
      lines.push(`${sha256File(file)}  ${path.relative(__dirname, file)}`);
    }
  }

  lines.sort();
  fs.writeFileSync(manifestPath, lines.join('\n') + '\n', 'utf8');
  return manifestPath;
}

if (!runEncodingValidation()) {
  console.error('[abort] predeploy bloqueado por falha de encoding');
  process.exit(1);
}

const manifestPath = writeManifest();
console.log(`[ok] manifest gerado: ${manifestPath}`);
console.log('[next] agora envie apenas os arquivos validados para a VM');
