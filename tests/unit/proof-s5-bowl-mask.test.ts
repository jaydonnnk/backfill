import {expect,it} from 'vitest';
import {fillBowlInterior} from '@/lib/creative/bowl-mask';
it('fills only enclosed bowl contents, preserving the original outline',()=>{
 const input={width:5,height:5,pixels:[0,1,1,1,0,1,0,0,0,1,1,0,0,0,1,1,0,0,0,1,0,1,1,1,0]};
 expect(fillBowlInterior(input,false).pixels).toEqual([0,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,1,1,1,0]);
 expect(input.pixels[6]).toBe(0);
});
it('closes a source-clipped left rim only between its actual edge intersections',()=>{
 const input={width:5,height:5,pixels:[0,0,0,0,0,1,1,1,1,1,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0]};
 expect(fillBowlInterior(input,true).pixels).toEqual([0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0]);
 expect(fillBowlInterior(input,false).pixels).toEqual(input.pixels);
});
it('does not join separate objects or fill background connected to an uncropped edge',()=>{
 const input={width:5,height:3,pixels:[1,0,0,0,1,1,0,0,0,1,1,0,0,0,1]};
 expect(fillBowlInterior(input,false)).toEqual(input);
});
