/* Camera-independent physical material resolution; Globe authoring only. */
(function(root,factory){
  const api=factory(
    root.CurvatureCameraMaterialAnchor||(typeof require==='function'?require('./CameraMaterialAnchor'):null),
    root.CurvatureGeometryEngine||(typeof require==='function'?require('../geometry/CurvatureGeometryEngine'):null),
    root.CurvatureEarClip||(typeof require==='function'?require('../geometry/CurvatureEarClip'):null));
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CurvatureCameraMaterialAnchorResolver=api;
}(typeof globalThis!=='undefined'?globalThis:this,function(anchor,engine,mesh){
  'use strict';
  const LAYOUT=Object.freeze(['NObjects','ObjType','ObjDist','ObjDeltaDist','ObjSideType','ObjSidePos','ObjSideVar','ObjSizeType','ObjSize','ObjSizeVar']);
  // Fixed neutral encoding reference, not a physical hypothesis.
  const REFERENCE_RADIUS=6371000,COORDINATE_SCALE=1e6;
  const finite3=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
  const index=n=>Number.isSafeInteger(n)&&n>=0;
  const fail=s=>{throw RangeError(s);};
  // Synchronous SHA-256 for ASCII canonical JSON, in browser/worker/Node.
  const K=[
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  function sha256Ascii(s){
    if(typeof s!=='string'||/[^\x00-\x7f]/.test(s)||s.length>0x1fffffff)fail('Invalid ASCII digest input');
    const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const bytes=new Uint8Array(Math.ceil((s.length+9)/64)*64);
    for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);
    bytes[s.length]=128;
    const data=new DataView(bytes.buffer);data.setUint32(bytes.length-4,s.length*8);
    const W=new Uint32Array(64);
    for(let offset=0;offset<bytes.length;offset+=64){
      for(let i=0;i<16;i++)W[i]=data.getUint32(offset+4*i);
      for(let i=16;i<64;i++){
        const a=W[i-15],b=W[i-2];
        W[i]=W[i-16]+(rotr(a,7)^rotr(a,18)^(a>>>3))+W[i-7]+(rotr(b,17)^rotr(b,19)^(b>>>10));
      }
      let [a,b,c,d,e,f,g,h]=H;
      for(let i=0;i<64;i++){
        const t1=(h+(rotr(e,6)^rotr(e,11)^rotr(e,25))+((e&f)^(~e&g))+K[i]+W[i])|0;
        const t2=((rotr(a,2)^rotr(a,13)^rotr(a,22))+((a&b)^(a&c)^(b&c)))|0;
        h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
      }
      [a,b,c,d,e,f,g,h].forEach((v,i)=>H[i]=(H[i]+v)>>>0);
    }
    return H.map(v=>v.toString(16).padStart(8,'0')).join('');
  }
  function snapshot(model){
    if(!model||model.showModel!==1||!Number.isFinite(model.rEarth)||model.rEarth<=0)
      fail('Globe physical model required');
    const s={showModel:1,rEarth:model.rEarth,Height:0};
    for(const k of LAYOUT){
      if(!Array.isArray(model[k])||model[k].length!==2||!Array.from(model[k]).every(Number.isFinite))
        fail('Invalid layout field '+k);
      s[k]=model[k].slice();
    }
    return s;
  }
  function primitiveIdentity(p,b){
    const owner=anchor.normalizeOwner(p.metadata?.landmarkOwner),ordinal=p.metadata?.landmarkPrimitive;
    if(owner.bank!==b||!index(ordinal)||owner.kind==='span'&&ordinal!==0)fail('Invalid authored primitive identity');
    const mode=p.type==='line'?1:p.mode??1;
    if(!['line','polygon'].includes(p.type)||!Number.isInteger(mode)||
      !Array.isArray(p.points)||!p.points.every(finite3))fail('Invalid authored primitive');
    return {owner,ordinal,type:p.type,mode,count:p.points.length};
  }
  const identityKey=(owner,ordinal)=>JSON.stringify([owner,ordinal]);
  function generated(model,b,radius,curvature){
    const scene=engine.createObjectSequenceScene({...model,geometryRadius:radius},b,true,
      {opticsNeutral:true,physicalSurface:true,curvature});
    const expected=model.NObjects[b]*(model.ObjSideType[b]===1?2:1);
    if(scene.metadata.objectCount!==expected)fail('Truncated authored bank');
    return scene.primitives;
  }
  function coordinateToken(x){
    const q=Math.round(x*COORDINATE_SCALE);
    if(!Number.isSafeInteger(q))fail('Authored coordinates outside signature range');
    return q===0?0:q;
  }
  // Bind exact layout and ordered neutral coordinates quantized to micrometres.
  function payload(model,b,neutral,identities){
    return JSON.stringify(['bank-v1',b,LAYOUT.map(k=>[k,model[k][b]]),
      neutral.map((p,i)=>[identities[i],p.points.map(q=>q.map(coordinateToken))])]);
  }
  const sameIndices=(a,b)=>a.length===b.length&&a.slice().sort((x,y)=>x-y).every((x,i)=>x===b[i]);
  function materialPoint(p,indices,weights){
    const o=p.points[indices[0]];
    const point=o.map((x,j)=>x+indices.reduce((s,i,k)=>s+weights[k]*(p.points[i][j]-x),0));
    if(!finite3(point))fail('Nonfinite material point');
    return point;
  }
  function create(model){
    const captured=snapshot(model),banks=new Map();
    function bank(b){
      if(b!==0&&b!==1)fail('Invalid landmark bank');
      if(banks.has(b))return banks.get(b);
      const physical=generated(captured,b,captured.rEarth,1/captured.rEarth);
      const neutral=generated(captured,b,REFERENCE_RADIUS,0);
      const ids=physical.map(p=>primitiveIdentity(p,b)),neutralIds=neutral.map(p=>primitiveIdentity(p,b));
      if(JSON.stringify(ids)!==JSON.stringify(neutralIds))fail('Physical and neutral authored topology mismatch');
      const byIdentity=new Map();
      for(const [i,id] of ids.entries()){
        const key=identityKey(id.owner,id.ordinal);
        if(byIdentity.has(key))fail('Ambiguous authored primitive identity');
        byIdentity.set(key,i);
      }
      const signature='bank-v1:sha256:'+sha256Ascii(payload(captured,b,neutral,neutralIds));
      const value={physical,ids,byIdentity,signature,topology:new Map()};banks.set(b,value);return value;
    }
    function topology(b,i){
      if(!b.topology.has(i)){
        const p=b.physical[i];b.topology.set(i,{edges:mesh.authoredEdges(p),...mesh.indexedTriangles(p)});
      }
      return b.topology.get(i);
    }
    function resolve(value){
      const a=anchor.normalizeAnchor(value),b=bank(a.owner.bank);
      if(a.signature!==b.signature)fail('Stale bank topology signature');
      const i=b.byIdentity.get(identityKey(a.owner,a.primitive));
      if(i===undefined)fail('Authored primitive not found');
      const p=b.physical[i];
      if(a.indices.some(j=>j>=p.points.length))fail('Original vertex index outside primitive');
      if(a.kind!=='vertex'){
        const t=topology(b,i);
        if(a.kind==='edge'&&!t.edges.some(e=>sameIndices(e,a.indices)))fail('Not a nondegenerate authored edge');
        if(a.kind==='surface'&&!t.triangles.some(t=>sameIndices(t,a.indices)))fail('Not an accepted authored triangle: '+(t.reason||'index mismatch'));
      }
      return {anchor:a,bank:a.owner.bank,index:i,point:materialPoint(p,a.indices,a.weights)};
    }
    // Bind by the complete ordered physical topology, retaining a private
    // target-coordinate snapshot. Never triangulate the virtual mesh anew.
    function bindProjectionBank(b,primitives){
      const physical=bank(b);
      if(!Array.isArray(primitives)||primitives.length!==physical.ids.length)
        fail('Projection bank topology mismatch');
      const owned=primitives.map((p,i)=>{
        const id=primitiveIdentity(p,b);
        if(JSON.stringify(id)!==JSON.stringify(physical.ids[i]))fail('Projection bank topology mismatch');
        return {points:p.points.map(q=>q.slice())};
      });
      return Object.freeze({point(kind,value){
        const q=resolveLandmark(kind,value);
        if(q.bank!==b)fail('Projection bank identity mismatch');
        const p=owned[q.index],a=q.anchor,pts=a.indices.map(i=>p.points[i]);
        const d=(u,v)=>u.map((x,i)=>x-v[i]);
        if(a.kind!=='vertex'){
          const u=d(pts[1],pts[0]),lu=Math.hypot(...u);
          if(!(lu>1e-10))fail('Degenerate projected edge');
          if(a.kind==='surface'){
            const v=d(pts[2],pts[0]),lv=Math.hypot(...v);
            const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
            if(!(lv>1e-10)||Math.hypot(...n)<=lu*lv*1e-12)fail('Degenerate projected triangle');
          }
        }
        return materialPoint(p,a.indices,a.weights);
      }});
    }
    function upgradeLegacy(value){
      const v=anchor.legacyVertex(value),b=bank(v.bank),id=b.ids[v.primitive];
      if(!id||v.objectType!==id.owner.objectType||v.vertex>=b.physical[v.primitive].points.length)
        fail('Legacy vertex topology mismatch');
      return {id:v.id,anchor:anchor.normalizeAnchor({kind:'vertex',owner:id.owner,primitive:id.ordinal,
        signature:b.signature,indices:[v.vertex],weights:[1]})};
    }
    function resolveLandmark(kind,value){
      const l=anchor.normalizeLandmark(kind,value),m=l.anchor?l:upgradeLegacy(l);
      return {id:m.id,...resolve(m.anchor)};
    }
    function fromPick(hit,id){
      const b=bank(hit?.bank),l=anchor.fromPick(hit,b.signature,id),q=resolve(l.anchor);
      if(hit.index!==q.index)fail('Pick primitive identity mismatch');
      return l;
    }
    return Object.freeze({signature:b=>bank(b).signature,resolve,resolveLandmark,upgradeLegacy,fromPick,bindProjectionBank});
  }
  return Object.freeze({create,sha256Ascii,LAYOUT,REFERENCE_RADIUS});
}));
