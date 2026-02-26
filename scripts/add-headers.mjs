import fs from 'node:fs/promises';
import path from 'node:path';

const HEADER = `/**
 * Copyright (c) OpenLoaf. All rights reserved.
 *
 * This source code is licensed under the AGPLv3 license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Project: OpenLoaf
 * Repository: https://github.com/OpenLoaf/OpenLoaf
 */
`;

const TARGET_DIRS = ['apps', 'packages'];
const TARGET_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const IGNORE_DIRS = ['node_modules', 'dist', 'out', '.next', 'generated', 'build', '.turbo', '.webpack', 'public', '.openloaf-office-plugins'];

async function processDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (!IGNORE_DIRS.includes(entry.name)) {
          await processDirectory(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (TARGET_EXTS.includes(ext)) {
          await addHeaderToFile(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`Error processing directory ${dirPath}:`, error);
  }
}

async function addHeaderToFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    
    if (!content.includes('Copyright (c) OpenLoaf')) {
      if (content.startsWith('#!')) {
        const lines = content.split('\\n');
        const shebang = lines[0];
        const rest = lines.slice(1).join('\\n');
        await fs.writeFile(filePath, `${shebang}\\n\\n${HEADER}\\n${rest}`);
      } else {
        await fs.writeFile(filePath, `${HEADER}\\n${content}`);
      }
      console.log(`Added header to: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

async function main() {
  console.log('Starting header injection...');
  for (const dir of TARGET_DIRS) {
    const fullDirPath = path.resolve(process.cwd(), dir);
    await processDirectory(fullDirPath);
  }
  console.log('Finished header injection.');
}

main();
