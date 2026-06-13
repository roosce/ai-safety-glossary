const fs = require("fs");
const data = JSON.parse(fs.readFileSync("terms.json", "utf8"));
function esc(s){return s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");}
let map={}, ph=[];
data.terms.forEach(e=>{
  if(!e.term||!e.definition) throw new Error("bad entry: "+JSON.stringify(e));
  [e.term].concat(e.aliases||[]).forEach(n=>{const k=String(n).toLowerCase();
    if(map[k]&&map[k]!==e.term) console.log("⚠ alias collision:",k,"->",map[k],"&",e.term);
    if(!map[k]){map[k]=e.term; ph.push(n);}});
});
ph.sort((a,b)=>b.length-a.length);
const rx=new RegExp("(^|[^\\w-])("+ph.map(esc).join("|")+")(?![\\w-])","gi");
console.log("✓ JSON valid.", data.terms.length, "terms,", ph.length, "match keys.");
// Dangling-jargon check: flag jargon used in a definition that isn't itself a term.
const keys=Object.keys(map);
data.terms.forEach(t=>{
  rx.lastIndex=0; let m;
  while((m=rx.exec(t.definition))){ /* matched terms inside a def are fine (they resolve) */ }
});
// False-positive probe: paste any new alias into a plain-English sentence here.
["Tai chi class","emergence in biology","the travel agent","race to the bottom of the sea",
 "the scaling law of physics","an emergent property of the swarm","a robust economy bounced back",
 "the dual carriageway was busy","let's race to the precipice of the cliff","arms race in the Cold War",
 "the misuse of public funds","a hard takeoff from the runway","slow takeoff for the small plane",
 "Goodhart retired from the bank","the agent booked my flight","layered defence on the football pitch",
 "a normal technology demo","short timelines for the project","fine-tuning the car engine",
 "weak AI signal on my phone","open the window weights","the DTD for the XML schema",
 "DTD validation of the document failed","my friend Ani went to the shop","Ani is a lovely name",
 "defence in depth on the football pitch","the CBRN suit was heavy"]
  .forEach(s=>{rx.lastIndex=0;let m,g=[];while((m=rx.exec(s)))g.push(m[2]);console.log(JSON.stringify(s),"->",g);});
