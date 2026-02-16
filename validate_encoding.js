const fs = require('fs');
const path = require('path');

const defaultTargets = [
  path.join(__dirname, 'assets'),
  path.join(__dirname, 'dist_clean', 'assets'),
];

const targets = process.argv.slice(2).map((p) => path.resolve(p));
const scanTargets = targets.length > 0 ? targets : defaultTargets;

const suspiciousTextPatterns = [
  /Ã[\x80-\xBF]/g, // classic mojibake
  /Â[\x80-\xBF]/g, // stray latin1 prefix
  /â[\x80-\xBF]/g, // punctuation/emoji break
  /ðŸ/g, // emoji decoded as latin1
  /ï¿½/g, // U+FFFD displayed as literal
];

function walkFiles(startDir) {
  const out = [];
  if (!fs.existsSync(startDir)) return out;
  const stack = [startDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(full);
      } else if (ent.isFile() && (full.endsWith('.js') || full.endsWith('.html'))) {
        out.push(full);
      }
    }
  }
  return out;
}

function countHex(haystackHex, needleHex) {
  let count = 0;
  let idx = 0;
  while (idx !== -1) {
    idx = haystackHex.indexOf(needleHex, idx);
    if (idx !== -1) {
      count += 1;
      idx += needleHex.length;
    }
  }
  return count;
}

function auditFile(filePath) {
  const buf = fs.readFileSync(filePath);
  const text = buf.toString('utf8');
  const hex = buf.toString('hex');

  const issues = [];

  const replacementCharCount = countHex(hex, 'efbfbd'); // U+FFFD in utf-8
  if (replacementCharCount > 0) {
    issues.push(`efbfbd=${replacementCharCount}`);
  }

  const doubleEncodedCount = countHex(hex, 'c383c2'); // typical ÃƒÂ sequence in bytes
  if (doubleEncodedCount > 0) {
    issues.push(`c383c2=${doubleEncodedCount}`);
  }

  let textHits = 0;
  for (const pattern of suspiciousTextPatterns) {
    const m = text.match(pattern);
    if (m) textHits += m.length;
  }
  if (textHits > 0) {
    issues.push(`text_mojibake_hits=${textHits}`);
  }

  return issues;
}

let totalFiles = 0;
let badFiles = 0;

for (const target of scanTargets) {
  const files = walkFiles(target);
  if (!files.length) {
    console.log(`[skip] no files found in ${target}`);
    continue;
  }

  for (const file of files) {
    totalFiles += 1;
    const issues = auditFile(file);
    if (issues.length) {
      badFiles += 1;
      console.log(`[bad] ${path.relative(process.cwd(), file)} -> ${issues.join(', ')}`);
    }
  }
}

if (totalFiles === 0) {
  console.error('[error] no target files to validate');
  process.exit(2);
}

if (badFiles > 0) {
  console.error(`[fail] ${badFiles}/${totalFiles} files with suspicious encoding markers`);
  process.exit(1);
}

console.log(`[ok] ${totalFiles} files validated with no suspicious markers`);
