import sharp from 'sharp';
import type { CreativeDeps } from '../../src/lib/creative/service';

// A geometric, authored fixture. Neither a dish photograph nor genuine model output.
export async function syntheticDishPhoto() {
  const width = 160, height = 120, rgb = Buffer.alloc(width * height * 3);
  for (let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const inside=x>=40&&x<120&&y>=30&&y<90, i=(y*width+x)*3;
    rgb[i]=inside?180:232;rgb[i+1]=inside?91:229;rgb[i+2]=inside?32:220;
  }
  return sharp(rgb,{raw:{width,height,channels:3}}).png().toBuffer();
}
export function creativeFixtureDeps(): CreativeDeps {
  return {
    source:'fixture', available:true,
    segment:async input=>({width:input.width,height:input.height,pixels:Array.from({length:input.width*input.height},(_,i)=> {const x=i%input.width,y=Math.floor(i/input.width);return x>=40&&x<120&&y>=30&&y<90?1:0;})}),
    background:async()=>sharp({create:{width:720,height:500,channels:3,background:'#c4b58f'}}).png().toBuffer(),
  };
}
