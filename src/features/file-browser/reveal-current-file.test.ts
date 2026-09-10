import { expect, it, vi } from "vitest";
import { findCurrentFile, relativeCurrentFile } from "./reveal-current-file";
const root={token:1,path:'/docs',name:'docs'};
it('requires a root path boundary and rejects traversal',()=>{
 expect(relativeCurrentFile('/docs','/docs-two/a.md')).toBeNull();
 expect(relativeCurrentFile('/docs','/docs/../a.md')).toBeNull();
 expect(relativeCurrentFile('/','/한글 a.md')).toBe('한글 a.md');
});
it('follows nested listings and preserves Unicode names',async()=>{
 const read=vi.fn(async (directory:string)=>({truncated:false,entries:directory===''?[{kind:'directory' as const,name:'하위',relativePath:'하위',path:'/docs/하위'}]:[{kind:'markdown' as const,name:'문서.md',relativePath:'하위/문서.md',path:'/docs/하위/문서.md'}]}));
 expect(await findCurrentFile(root,'/docs/하위/문서.md',read,()=>true)).toEqual({path:'하위/문서.md',ancestors:['하위']});
 expect(read.mock.calls.map(c=>c[0])).toEqual(['','하위']);
});
it('does not continue after context changes during lookup',async()=>{
 let valid=true; const read=vi.fn(async()=>{valid=false;return {truncated:false,entries:[]};});
 expect(await findCurrentFile(root,'/docs/a.md',read,()=>valid)).toBeNull(); expect(read).toHaveBeenCalledOnce();
});
it('reports missing and capped listings without claiming a match',async()=>{
 for(const truncated of [false,true]) await expect(findCurrentFile(root,'/docs/a.md',async()=>({entries:[],truncated}),()=>true)).rejects.toThrow(truncated?'한도':'찾지 못했습니다');
});
