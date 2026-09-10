import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../src/assets/icons/',import.meta.url));
const entries=JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8'));
const names=new Set();
for(const e of entries) {
 assert(!names.has(e.name),`Duplicate name: ${e.name}`);names.add(e.name);
 assert(/^[a-z0-9-]+\.svg$/.test(e.file),`Use a canonical asset: ${e.name}`);
 const svg=await readFile(path.join(root,e.file),'utf8');
 assert(svg.includes('viewBox="0 0 24 24"'),e.name);
 assert(svg.includes('stroke-width="1.8"'),e.name);
 assert(svg.includes('stroke="currentColor"'),e.name);
 assert(svg.includes('stroke-linejoin="round"'),e.name);
 assert(!/#[0-9a-f]{3,8}\b|<script|<image|href=/i.test(svg),`Unexpected fixed color or external content: ${e.name}`);
}
for(const [a,b] of [['copy','copy-active'],['search','search-current'],['close','search-close']]) {
 assert.equal(entries.find(e=>e.name===a).file,entries.find(e=>e.name===b).file);
}
console.log(`Checked ${entries.length} catalogue entries; this is not visual acceptance.`);
