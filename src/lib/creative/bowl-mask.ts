import { Mask } from './pixels';

// An explicit local correction for a bowl-with-contents target, never food synthesis.
export function fillBowlInterior(value:unknown,clippedLeft:boolean):Mask{
 const mask=Mask.parse(value),{width,height}=mask,pixels=[...mask.pixels];
 if(clippedLeft){
  const contacts=[];for(let y=0;y<height;y++)if(pixels[y*width]===1)contacts.push(y);
  const first=contacts[0],last=contacts.at(-1);
  if(first!==undefined&&last!==undefined)for(let y=first;y<=last;y++)pixels[y*width]=1;
 }
 const outside=new Uint8Array(width*height),queue=new Uint32Array(width*height);let head=0,tail=0;
 const add=(i:number)=>{if(pixels[i]===0&&outside[i]===0){outside[i]=1;queue[tail++]=i;}};
 for(let x=0;x<width;x++){add(x);add((height-1)*width+x);}
 for(let y=0;y<height;y++){add(y*width);add(y*width+width-1);}
 while(head<tail){const i=queue[head++];if(i===undefined)throw Error('invalid_fill_queue');const x=i%width,y=Math.floor(i/width);if(x>0)add(i-1);if(x+1<width)add(i+1);if(y>0)add(i-width);if(y+1<height)add(i+width);}
 for(let i=0;i<pixels.length;i++)if(pixels[i]===0&&outside[i]===0)pixels[i]=1;
 return {width,height,pixels};
}
