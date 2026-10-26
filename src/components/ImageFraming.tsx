import {useRef} from 'react';
import {Check,Maximize,Minus,Plus,RotateCcw} from 'lucide-react';
import type {CardDef} from '../game/cards';
import {clampView,containZoom,imageGeometry,DEFAULT_IMAGE_VIEW,type ImageView} from '../game/image-view';
import Modal from './Modal';
import {Card} from './Card';

export default function ImageFraming({card,change,close}:{card:CardDef;change:(view:ImageView)=>void;close:()=>void}) {
 const preview=useRef<HTMLDivElement>(null),drag=useRef<{id:number;startX:number;startY:number;width:number;height:number;rangeX:number;rangeY:number;view:ImageView}|null>(null);
 const view=card.editor?.imageView??DEFAULT_IMAGE_VIEW;
 const update=(patch:Partial<ImageView>)=>change(clampView({...view,...patch}));
 const fit=()=>{const image=preview.current?.querySelector('img'),frame=preview.current?.querySelector('.card-art');if(image?.naturalHeight&&frame){const box=frame.getBoundingClientRect();change({zoom:containZoom(image.naturalWidth/image.naturalHeight,box.width/box.height),x:0,y:0});}};
 return <Modal title="Кадрирование картинки" close={close} className="image-framing-modal paged-modal"><header><h2>Кадрирование картинки</h2><p>Двигай картинку пальцем или мышью. Масштаб меняется ползунком.</p></header><div className="image-framing-layout"><div ref={preview} className="image-frame-preview" aria-label="Предпросмотр кадрирования" onPointerDown={e=>{
  const box=preview.current?.querySelector('.card-art')?.getBoundingClientRect();if(!box||e.button!==0||e.clientX<box.left||e.clientX>box.right||e.clientY<box.top||e.clientY>box.bottom)return;
  const image=preview.current?.querySelector('img');if(!image?.naturalHeight)return;const geometry=imageGeometry(image.naturalWidth/image.naturalHeight,box.width/box.height,view);
  e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);drag.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,width:box.width,height:box.height,rangeX:geometry.rangeX,rangeY:geometry.rangeY,view:{...view}};
 }} onPointerMove={e=>{const d=drag.current;if(!d||d.id!==e.pointerId)return;change(clampView({...d.view,x:d.view.x+(e.clientX-d.startX)/d.width*10000/d.rangeX,y:d.view.y+(e.clientY-d.startY)/d.height*10000/d.rangeY}));}} onPointerUp={e=>{if(drag.current?.id===e.pointerId)drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><Card card={card}/></div>
 <div className="image-frame-controls"><label>Масштаб <output>{Math.round(view.zoom*100)}%</output><span><button aria-label="Отдалить картинку" onClick={()=>update({zoom:view.zoom-.1})}><Minus size={18}/></button><input aria-label="Масштаб картинки" type="range" min="0.01" max="4" step="0.01" value={view.zoom} onChange={e=>update({zoom:Number(e.target.value)})}/><button aria-label="Приблизить картинку" onClick={()=>update({zoom:view.zoom+.1})}><Plus size={18}/></button></span></label><label>По горизонтали <output>{Math.round(view.x)}</output><input aria-label="Сдвиг картинки по горизонтали" type="range" min="-100" max="100" step="1" value={view.x} onChange={e=>update({x:Number(e.target.value)})}/></label><label>По вертикали <output>{Math.round(view.y)}</output><input aria-label="Сдвиг картинки по вертикали" type="range" min="-100" max="100" step="1" value={view.y} onChange={e=>update({y:Number(e.target.value)})}/></label><button className="button secondary" onClick={fit}><Maximize size={16}/>Вписать целиком</button><button className="button secondary" onClick={()=>change({...DEFAULT_IMAGE_VIEW})}><RotateCcw size={16}/>Сбросить кадр</button></div></div><footer><button className="button primary" onClick={close}><Check size={17}/>Готово</button></footer></Modal>;
}
