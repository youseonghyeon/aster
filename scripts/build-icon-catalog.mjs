import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../src/assets/icons/", import.meta.url));
const entries = JSON.parse(await readFile(path.join(root, "catalog.json"), "utf8"));
const escape = (text) => String(text).replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const icons = new Map();
const rows = [];
for (const entry of entries) {
  const svg = await readFile(path.join(root, entry.file), "utf8");
  icons.set(entry.name, svg);
  rows.push(`<tr><td><strong>${escape(entry.label)}</strong><small>${escape(entry.file)} · ${escape(entry.note)}</small></td><td class="light">${svg}</td><td class="dark">${svg}</td><td class="selected">${svg}</td><td class="large">${svg}</td></tr>`);
}
const menu = [["reload", "다시 로드", ""], ["copy", "복사", "⌘C"], [null, "이름 복사", "⇧⌘C"], ["trash", "삭제...", ""]]
  .map(([name, label, shortcut]) => `<div class="menurow">${name ? icons.get(name) : '<span class="blank"></span>'}<span>${label}</span><kbd>${shortcut}</kbd></div>`).join("");
const template = "<!doctype html><html lang=\"ko\"><meta charset=\"utf-8\"><title>Aster 아이콘 카탈로그</title><style>\n*{box-sizing:border-box}body{margin:0;background:#f1f3f5;color:#25303a;font:15px -apple-system,BlinkMacSystemFont,sans-serif}main{max-width:1000px;margin:48px auto;padding:0 28px 64px}h1{font-size:28px;margin-bottom:12px}p{line-height:1.65;color:#596571}small{display:block;color:#7b8590;font-size:12px;margin-top:5px}table{width:100%;border-collapse:separate;border-spacing:0 8px}th{font-size:12px;text-align:center;color:#6c7782}th:first-child{text-align:left}td{padding:18px;background:white}td:first-child{border-radius:10px 0 0 10px;width:45%}td:last-child{border-radius:0 10px 10px 0}td:not(:first-child){text-align:center}svg{display:inline-block;width:18px;height:18px;vertical-align:middle}td.dark{background:#252c34;color:#e6eaf0}td.selected{background:#3671b8;color:white}td.large svg{width:48px;height:48px}.samples{display:flex;gap:24px;flex-wrap:wrap;margin:24px 0 36px}.menu{padding:6px;background:#fff;border:1px solid #d5dce3;border-radius:9px;box-shadow:0 8px 25px #24314214;min-width:260px}.menurow{display:flex;gap:10px;align-items:center;padding:9px 10px;border-radius:5px}.menurow:hover{background:#3671b8;color:#fff}.menurow svg,.blank{width:18px;height:18px;flex:none}.menurow kbd{margin-left:auto;font:12px -apple-system,sans-serif;color:inherit;opacity:.65}.badge{font-size:12px;display:inline-block;background:#e0e7ec;border-radius:5px;padding:5px 8px}.note{border-left:3px solid #9eb2c4;padding-left:14px}\n</style><main><span class=\"badge\">아이콘 원본 · 적용 및 검토용</span><h1>Aster 아이콘 카탈로그</h1><p>직접 작성한 SVG {{COUNT}}종. 24×24 기준, 선 굵기 1.6, 둥근 선 끝과 모서리로 통일했습니다.<br>작은 크기에서 복잡한 장식을 줄이고, 배경에 따라 같은 원본의 색만 바꾸는 방향입니다.</p><div class=\"samples\"><div><strong>현재 요청한 메뉴 구성</strong><div class=\"menu\">{{MENU}}</div><small>이름 복사는 빈 아이콘 칸을 유지합니다.</small></div><div style=\"flex:1;min-width:260px\"><p class=\"note\">휴지통은 삭제 메뉴에 적용했습니다. 이름 복사 아이콘은 시안으로만 유지하며 메뉴에는 빈 공간을 둡니다.</p><p>이 HTML은 비교용입니다. 실제 Aster 앱 메뉴의 크기·선택 상태 검증을 대신하지 않습니다.</p></div></div><table><thead><tr><th>용도 / 파일</th><th>밝음 · 18px</th><th>어두움 · 18px</th><th>선택 · 18px</th><th>확대 · 48px</th></tr></thead><tbody>{{ROWS}}</tbody></table></main></html>";
const output = path.resolve(process.argv[2] ?? "docs/design/aster-icons.html");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, template.replace("{{COUNT}}", String(entries.length)).replace("{{ROWS}}", rows.join("")).replace("{{MENU}}", menu));
console.log(output);
