#!/bin/sh
# usage: tools/sim/prof.sh years
rm -rf /tmp/claude-0/prof && node --cpu-prof --cpu-prof-dir=/tmp/claude-0/prof --import tsx tools/sim/run.ts ${1:-0.5} > /dev/null 2>&1
node -e "
const fs=require('fs');const f=fs.readdirSync('/tmp/claude-0/prof')[0];const p=JSON.parse(fs.readFileSync('/tmp/claude-0/prof/'+f));
const dt={};for(let i=0;i<p.samples.length;i++){dt[p.samples[i]]=(dt[p.samples[i]]||0)+(p.timeDeltas[i]||0);}
const self={};for(const n of p.nodes){const k=n.callFrame.functionName+' '+n.callFrame.url.split('/').pop()+':'+n.callFrame.lineNumber;self[k]=(self[k]||0)+(dt[n.id]||0);}
// inclusive
const byId={};for(const n of p.nodes)byId[n.id]=n;const parent={};for(const n of p.nodes)for(const c of (n.children||[]))parent[c]=n.id;
const incl={};for(const n of p.nodes){let t=dt[n.id]||0;if(!t)continue;const seen=new Set();let x=n.id;while(x!==undefined){const nn=byId[x];const k=nn.callFrame.functionName+' '+nn.callFrame.url.split('/').pop()+':'+nn.callFrame.lineNumber;if(!seen.has(k)){incl[k]=(incl[k]||0)+t;seen.add(k);}x=parent[x];}}
console.log('SELF');console.log(Object.entries(self).sort((a,b)=>b[1]-a[1]).slice(0,18).map(([k,v])=>(v/1000).toFixed(0)+'ms '+k).join('\n'));
console.log('INCL');console.log(Object.entries(incl).sort((a,b)=>b[1]-a[1]).slice(0,30).map(([k,v])=>(v/1000).toFixed(0)+'ms '+k).join('\n'));"
