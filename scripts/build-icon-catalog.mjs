import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const assetRoot = path.join(sourceRoot, "assets/icons");
const entries = JSON.parse(await readFile(path.join(assetRoot, "catalog.json"), "utf8"));
const escape = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const groups = [
  ["header", "상단 헤더", "이동 기록, 문서 탐색, 목차, 파일 열기와 읽기 설정"],
  ["files", "파일 탐색", "폴더와 문서, 현재 파일 찾기"],
  ["search", "검색", "검색 열기, 이전·다음 결과와 닫기"],
  ["preview", "미리보기 · 패널", "전체보기, 패널 배치와 스크롤 동기화"],
  ["menus", "우클릭 메뉴", "다시 로드, 복사, 이름 복사와 삭제"],
];
const status = { applied: "SVG 적용", inline: "현재 코드 SVG", proposal: "승인 에셋 · 미연결" };
const seen = new Set();
for (const entry of entries) {
  if (seen.has(entry.name)) throw new Error(`Duplicate icon: ${entry.name}`);
  seen.add(entry.name);
  entry.svg = await readFile(path.join(assetRoot, entry.file), "utf8");
  entry.origin = `src/assets/icons/${entry.file}`;
}
const icons = new Map(entries.map(e => [e.name, e.svg]));
const output = path.resolve(process.argv[2] ?? "docs/design/aster-icons.html");
const directory = path.dirname(output);
await mkdir(path.join(directory, "icons"), { recursive: true });
const css = `
.family{display:grid;grid-template-columns:repeat(auto-fill,minmax(115px,1fr));gap:18px;padding:24px;background:var(--surface);border:1px solid var(--line);border-radius:8px}.family-item{display:grid;justify-items:center;gap:12px}.family-item span{font-size:10px;color:var(--muted);text-align:center}.family-item svg{width:24px;height:24px}

.comparison-label{font-size:10px;color:var(--muted);width:38px}.specimen.before{height:78px;border-bottom:1px solid var(--line);background:var(--surface)}.specimen.after{height:104px}.specimen.before,.specimen.after{gap:20px}.specimen.after .large svg,.specimen.before .large svg{width:48px;height:48px}.specimen span:not(.comparison-label){display:grid;justify-items:center;gap:6px}.specimen small{font-size:9px;color:var(--muted)}

*{box-sizing:border-box}body{--bg:#f5f6f8;--surface:#fff;--text:#293743;--muted:#788591;--line:#e0e5eb;--accent:#396e90;--soft:#edf3f7;margin:0;background:var(--bg);color:var(--text);font:14px -apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo",sans-serif}body.dark{--bg:#1d2229;--surface:#272e37;--text:#e0e6ec;--muted:#9aa6b4;--line:#3b4551;--accent:#a0c5df;--soft:#314352}a{color:inherit;text-decoration:none}button,input{font:inherit}button{cursor:pointer}aside{position:fixed;inset:0 auto 0 0;width:220px;background:var(--surface);border-right:1px solid var(--line);padding:32px 20px}aside strong{display:block;font-size:17px;margin-bottom:6px}aside small{color:var(--muted)}nav{display:grid;gap:5px;margin-top:32px}nav a{padding:11px 12px;border-radius:6px;font-size:13px;color:var(--muted)}nav a.active,nav a:hover{background:var(--soft);color:var(--accent)}main{max-width:1260px;margin-left:220px;padding:32px 40px 60px}header{display:flex;align-items:center;justify-content:space-between;color:var(--muted);font-size:12px;margin-bottom:34px}.theme{padding:8px 12px;background:var(--surface);color:var(--text);border:1px solid var(--line);border-radius:6px}h1{font-size:30px;letter-spacing:-.035em;margin:0 0 12px}p{line-height:1.7;color:var(--muted)}.categories{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:28px 0}.category{padding:18px;border:1px solid var(--line);background:var(--surface);border-radius:8px}.category:hover{border-color:var(--accent)}.category b{display:block;margin-bottom:7px}.category span{font-size:12px;color:var(--muted);line-height:1.6}.tools{display:flex;gap:12px;align-items:center;margin:30px 0 18px}.tools input{width:min(360px,75%);padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--surface);color:var(--text)}.count{font-size:12px;color:var(--muted)}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}.card{background:var(--surface);border:1px solid var(--line);border-radius:8px;overflow:hidden}.specimen{height:116px;display:flex;align-items:center;justify-content:center;gap:28px;background:var(--bg)}svg{width:18px;height:18px;vertical-align:middle;flex:none}.specimen .tiny svg{width:16px;height:16px}.specimen .large svg{width:42px;height:42px}.meta{padding:17px}.meta b{font-size:14px}.state{display:block;color:var(--accent);font-size:10px;margin-top:7px}.origin{font-size:10px;color:var(--muted);overflow-wrap:anywhere;line-height:1.5;margin:12px 0}.meta p{font-size:12px;margin:10px 0}.download{font-size:11px;color:var(--accent)}.preview{padding:20px;background:var(--surface);border:1px solid var(--line);border-radius:8px;overflow:auto;margin:24px 0}.toolbar{display:flex;align-items:center;gap:4px;min-width:470px}.toolbar button{display:grid;place-items:center;width:32px;height:32px;border:1px solid transparent;border-radius:6px;background:none;color:var(--muted)}.toolbar button:hover,.toolbar button:focus-visible{background:var(--soft);color:var(--accent);border-color:var(--line);outline:none}.toolbar .document{flex:1;text-align:center;font-size:12px}.preview small{display:block;color:var(--muted);font-size:11px;margin-top:14px}.note{font-size:12px;padding:14px 0;margin:0}.note a{color:var(--accent);text-decoration:underline}.empty{display:none;color:var(--muted)}[hidden]{display:none!important}footer{margin-top:32px;color:var(--muted);font-size:11px}@media(max-width:800px){aside{position:static;width:auto;padding:20px;border-right:0;border-bottom:1px solid var(--line)}nav{display:flex;overflow:auto;margin-top:18px;white-space:nowrap}main{margin:0;padding:26px 20px}h1{font-size:26px}.grid{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}}
`;
function page(group) {
  const sub = Boolean(group);
  const home = sub ? "../aster-icons.html" : "aster-icons.html";
  const link = id => sub ? `${id}.html` : `icons/${id}.html`;
  const title = group?.[1] ?? "전체 아이콘";
  const list = group ? entries.filter(e => e.groups.includes(group[0])) : entries;
  const nav = `<a href="${home}" class="${!sub ? "active" : ""}">전체 목록 · ${entries.length}</a>` + groups.map(g => `<a href="${link(g[0])}" class="${g === group ? "active" : ""}">${g[1]}</a>`).join("");
  const categories = !sub ? `<div class="categories">${groups.map(g => `<a class="category" href="${link(g[0])}"><b>${g[1]}</b><span>${g[2]}<br>${entries.filter(e => e.groups.includes(g[0])).length}개</span></a>`).join("")}</div>` : "";
  const button = name => `<button title="${escape(entries.find(e => e.name === name)?.label ?? name)}" type="button">${icons.get(name)}</button>`;
  const demo = group?.[0] === "header" ? `<div class="preview"><div class="toolbar">${button("history-back")}${button("history-forward")}${button("document-browser")}${button("outline")}<span class="document">감사로그 요구사항.md</span>${button("folder-open")}${button("reading-settings")}</div><small>현재 적용한 상단 구성</small></div>` : group?.[0] === "preview" ? `<div class="preview"><div class="toolbar">${["search-current", "focus-enter", "focus-exit", "panel-layout", "scroll-sync", "swap-panes", "reset-split"].map(button).join("")}</div><small>현재 코드의 모양을 비교합니다. 버튼은 모양 확인용입니다.</small></div>` : "";

  const family = `<div class="family">${list.map(e => `<div class="family-item">${e.svg}<span>${escape(e.label)}</span></div>`).join("")}</div>`;
  const cards = list.map(e => `<article class="card" data-search="${escape(e.label + " " + e.name + " " + e.note)}"><div class="specimen after"><span class="tiny">${e.svg}<small>16px</small></span><span>${e.svg}<small>18px</small></span><span class="large">${e.svg}<small>48px</small></span></div><div class="meta"><b>${escape(e.label)}</b><span class="state">${status[e.status]}</span><p>${escape(e.note)}</p><div class="origin">${escape(e.origin)}</div><a class="download" href="data:image/svg+xml;charset=utf-8,${encodeURIComponent(e.svg)}" download="${escape(e.name)}.svg">SVG 보기 / 저장</a></div></article>`).join("");
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Aster 아이콘 · ${title}</title><style>${css}</style><body><aside><strong>아이콘 라이브러리</strong><small>Aster · 원본과 사용 위치</small><nav>${nav}</nav></aside><main><header><a href="${home}">전체 목록${sub ? " / " + title : ""}</a><button class="theme" type="button">밝음 / 어두움</button></header><h1>${title}</h1><p>${group?.[2] ?? "사용하는 위치별로 모아 보고, 실제 크기와 확대 모양을 비교합니다."}<br>각 아이콘은 16px · 18px · 48px 확대 순서입니다.</p>${categories}${family}${demo}<div class="tools"><input type="search" aria-label="아이콘 찾기" placeholder="이름이나 용도로 찾기"><span class="count">${list.length}개</span></div><div class="grid">${cards}</div><p class="empty">일치하는 아이콘이 없습니다.</p><footer>SVG 적용: 앱이 원본을 사용합니다. 승인 에셋 · 미연결: 현재 UI에는 표시하지 않는 승인 원본입니다.<br>catalog.json과 원본에서 생성한 문서입니다. HTML을 직접 수정하지 않습니다.</footer></main><script>try{document.body.classList.toggle('dark',localStorage.getItem('aster-catalog-theme')==='dark')}catch{}document.querySelector('.theme').onclick=()=>{document.body.classList.toggle('dark');try{localStorage.setItem('aster-catalog-theme',document.body.classList.contains('dark')?'dark':'light')}catch{}};document.querySelector('input').oninput=e=>{let count=0;const q=e.target.value.toLowerCase();document.querySelectorAll('.card').forEach(card=>{card.hidden=!card.dataset.search.toLowerCase().includes(q);if(!card.hidden)count++});document.querySelector('.count').textContent=count+'개';document.querySelector('.empty').style.display=count?'none':'block'};</script></body></html>`;
}
await writeFile(output, page());
for (const group of groups) await writeFile(path.join(directory, "icons", `${group[0]}.html`), page(group));
await writeFile(path.join(directory, "aster-header-icons.html"), '<!doctype html><html lang="ko"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=icons/header.html"><title>상단 헤더 아이콘</title><a href="icons/header.html">상단 헤더 아이콘 페이지로 이동</a></html>');
console.log(`Generated ${entries.length} icons, index and ${groups.length} category pages: ${output}`);
