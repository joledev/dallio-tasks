import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(path)) files.push(relative(root, path));
  }
  return files;
}

const files = walk(join(root, 'src'));

const proposalImportAllowed = (file) =>
  file.startsWith('src/core/proposals/') ||
  file.startsWith('src/app/api/b/[token]/proposals/') ||
  file === 'src/app/api/b/[token]/mode/route.ts' ||
  file === 'src/app/_components/proposals-panel.tsx' ||
  file === 'src/app/_hooks/use-board-data.ts' ||
  file === 'src/app/_lib/api.ts' ||
  file === 'src/app/_lib/types.ts';

const violations = [];

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  if (text.includes('@/core/proposals') && !proposalImportAllowed(file)) {
    violations.push(`${relative(root, file)} imports core/proposals outside the L5 boundary`);
  }
  if (/\bBoard\.mode\b/.test(text)) {
    violations.push(`${relative(root, file)} references Board.mode`);
  }
}

if (violations.length) {
  console.error('Voting cut-check failed:');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}
