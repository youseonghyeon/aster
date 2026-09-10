// Static SVG contact sheets only: no browser or app automation.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../src/assets/icons/', import.meta.url));
const entries = JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8'));
const output = path.resolve(process.argv[2] ?? '/tmp/aster-icon-review');
await mkdir(output,{recursive:true});
const escape = s => s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
for (const theme of ['light','dark']) {
 for (let page=0;page<Math.ceil(entries.length/6);page++) {
  const bg=theme==='light'?'#f5f6f8':'#1d2229';
  const fg=theme==='light'?'#293743':'#e0e6ec';
  // Quick Look's default web thumbnail scaling differs from CSS pixel sizes.
  // The SVG viewBox is the reference; verify real control sizes in the HTML too.
  const parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="576" viewBox="0 0 960 720"><rect width="960" height="720" fill="${bg}"/><g color="${fg}" fill="${fg}" font-family="Helvetica" font-size="14">`];
  for(const [i,e] of entries.slice(page*6,page*6+6).entries()) {
   const x=i%2*480,y=Math.floor(i/2)*240;
   const original=await readFile(path.join(root,e.file),'utf8');
   parts.push(`<text x="${x+20}" y="${y+30}">${escape(e.name)}</text>`);
   for(const [size,dx] of [[16,40],[18,120],[48,230]]) {
    const svg=original.replace(/<svg\b[^>]*>/,tag=>tag.replace(/\s(?:width|height)="[^"]*"/g,'').replace('<svg ',`<svg x="${x+dx}" y="${y+65}" width="${size}" height="${size}" `));
    parts.push(svg,`<text x="${x+dx}" y="${y+150}" font-size="11">${size}px reference</text>`);
   }
  }
  parts.push('</g></svg>');
  const file=path.join(output,`${theme}-${page+1}.svg`);
  await writeFile(file,parts.join(''));
  if(process.platform==='darwin') {
   const result=spawnSync('/usr/bin/qlmanage',['-t','-s','960','-o',output,file],{encoding:'utf8'});
   if(result.status!==0) throw new Error(result.stderr || `Quick Look failed: ${file}`);
  }
 }
}
console.log(`Wrote ${entries.length} icons in light/dark contact sheets: ${output}`);
