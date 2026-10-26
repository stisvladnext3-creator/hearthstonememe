export interface ImageView { zoom:number; x:number; y:number }
export const DEFAULT_IMAGE_VIEW:ImageView={zoom:1,x:0,y:0};
export const clampView=(view:ImageView):ImageView=>({zoom:Math.max(.01,Math.min(4,view.zoom)),x:Math.max(-100,Math.min(100,view.x)),y:Math.max(-100,Math.min(100,view.y))});
export function validImageView(raw:unknown):raw is ImageView {
  if(!raw||typeof raw!=='object')return false;const v=raw as ImageView;
  return [v.zoom,v.x,v.y].every(n=>typeof n==='number'&&Number.isFinite(n))&&v.zoom>=.01&&v.zoom<=4&&Math.abs(v.x)<=100&&Math.abs(v.y)<=100;
}
export function imageGeometry(imageRatio:number,frameRatio:number,view:ImageView=DEFAULT_IMAGE_VIEW) {
  const width=Math.max(1,imageRatio/frameRatio)*100*view.zoom,height=Math.max(1,frameRatio/imageRatio)*100*view.zoom;
  const rangeX=Math.max(1,Math.abs(width-100)/2),rangeY=Math.max(1,Math.abs(height-100)/2);
  return {width,height,left:50+view.x/100*rangeX,top:50+view.y/100*rangeY,rangeX,rangeY};
}
export const containZoom=(imageRatio:number,frameRatio:number)=>Math.max(.01,Math.min(1,imageRatio/frameRatio,frameRatio/imageRatio));
