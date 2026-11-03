'use strict';

// Minimal deterministic WebGPU command/buffer mock for the archived precision
// diagnostics. The callback supplies *synthetic* readback data; this exercises
// orchestration and cleanup, NOT WGSL compilation or numerical GPU correctness.
function mockedGpu({wordsPerRow,readback}){
  if(![4,16].includes(wordsPerRow)||typeof readback!=='function')
    throw new TypeError('A supported row width and synthetic readback are required');
  const mock={codes:[],writes:[],buffers:[],dispatches:0,copies:[],
    deviceDestroyed:false,destroyed:false};
  const usage={STORAGE:1,COPY_DST:2,COPY_SRC:4,MAP_READ:8};
  const device={limits:{maxStorageBufferBindingSize:1e8},
    createShaderModule({code}){
      const match=/const MODE:u32=(\d+)u;/.exec(code);
      if(!match)throw Error('Expected a distinct WGSL mode');
      mock.codes.push(code);
      return {mode:Number(match[1]),getCompilationInfo:async()=>({messages:[]})};
    },
    async createComputePipelineAsync({compute}){
      return {mode:compute.module.mode,getBindGroupLayout:()=>({})};
    },
    createBindGroup({entries}){
      if(entries.length!==(wordsPerRow===4?4:3))throw Error('Unexpected bindings');
      return entries.map(e=>e.resource.buffer);
    },
    createBuffer({size}){
      const buffer={bytes:new ArrayBuffer(size),destroyed:false,
        destroy(){this.destroyed=true;},async mapAsync(){},
        getMappedRange(offset,length){return this.bytes.slice(offset,offset+length);},
        unmap(){}};
      mock.buffers.push(buffer);
      return buffer;
    },
    createCommandEncoder(){
      const commands=[];
      let pipeline,bindings;
      return {
        beginComputePass(){return {
          setPipeline(p){pipeline=p;},setBindGroup(_index,b){bindings=b;},
          dispatchWorkgroups(groups){
            if(!Number.isInteger(groups)||groups<1)throw Error('Invalid workgroup count');
            mock.dispatches++;
            commands.push(()=>{
              const config=new Uint32Array(bindings.at(-1).bytes);
              const count=config[0],input=new Float32Array(bindings[0].bytes);
              const operations=wordsPerRow===4?new Uint32Array(bindings[1].bytes):null;
              const output=new Float32Array(bindings[wordsPerRow===4?2:1].bytes);
              if(groups!==Math.ceil(count/64))throw Error('Incorrect dispatch capacity');
              for(let row=0;row<count;row++){
                const words=readback({row,mode:pipeline.mode,input,operations,config});
                if(words.length!==wordsPerRow||!words.every(Number.isFinite))
                  throw Error('Invalid synthetic GPU readback');
                output.set(words,row*wordsPerRow);
              }
            });
          },end(){}
        };},
        copyBufferToBuffer(src,srcOffset,dst,dstOffset,length){
          mock.copies.push(length);
          commands.push(()=>new Uint8Array(dst.bytes,dstOffset,length)
            .set(new Uint8Array(src.bytes,srcOffset,length)));
        },finish(){return commands;}
      };
    },
    queue:{writeBuffer(buffer,offset,data){
      mock.writes.push(data);
      new Uint8Array(buffer.bytes,offset,data.byteLength)
        .set(new Uint8Array(data.buffer,data.byteOffset,data.byteLength));
    },submit(commands){for(const command of commands)for(const action of command)action();}},
    destroy(){mock.deviceDestroyed=true;mock.destroyed=true;}
  };
  mock.deps={navigator:{gpu:{requestAdapter:async()=>({
    info:{vendor:'synthetic'},requestDevice:async()=>device})}},
    GPUBufferUsage:usage,GPUMapMode:{READ:1}};
  return mock;
}
module.exports={mockedGpu};
