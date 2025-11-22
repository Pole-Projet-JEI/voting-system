#!/usr/bin/env node

import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read codes from the seed file
const codesPath = join(__dirname, '../server/src/seed/codes.mjs');

console.log('📦 Extracting voter codes from seed file...');

try {
  const content = fs.readFileSync(codesPath, 'utf8');
  
  // Extract codes using regex
  const codeMatches = content.match(/"[A-Za-z0-9]{9}"/g);
  
  if (!codeMatches || codeMatches.length === 0) {
    console.error('❌ No voter codes found in codes.mjs');
    process.exit(1);
  }
  
  // Remove quotes and take first 500 codes
  const codes = codeMatches.map(code => code.replace(/"/g, '')).slice(0, 500);
  
  // Create JSON file
  const outputPath = join(__dirname, 'voter-codes.json');
  const output = {
    codes,
    total: codes.length,
    generated: new Date().toISOString(),
  };
  
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  
  console.log(`✅ Extracted ${codes.length} voter codes`);
  console.log(`📄 Saved to: ${outputPath}`);
  console.log(`\n🚀 You can now run k6 tests!`);
  
} catch (error) {
  console.error('❌ Error extracting codes:', error.message);
  process.exit(1);
}

