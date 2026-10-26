import {useLayoutEffect,useRef,useState} from 'react';
import {DEFAULT_IMAGE_VIEW,imageGeometry,type ImageView} from '../game/image-view';

export default function FramedArt({src,view=DEFAULT_IMAGE_VIEW,className=''}:{src:string;view?:ImageView;className?:string}) {
 const ref=useRef<HTMLDivElement>(null),[frameRatio,setFrameRatio]=useState(1),[imageRatio,setImageRatio]=useState(1);
 useLayoutEffect(()=>{const el=ref.current;if(!el)return;const fit=()=>{if(el.clientWidth&&el.clientHeight)setFrameRatio(el.clientWidth/el.clientHeight);};fit();const observer=new ResizeObserver(fit);observer.observe(el);return()=>observer.disconnect();},[]);
 const geometry=imageGeometry(imageRatio,frameRatio,view);
 return <div ref={ref} className={`portrait-art original-portrait portrait adjustable-art ${className}`}><img src={src} alt="" draggable={false} onLoad={e=>{const img=e.currentTarget;if(img.naturalHeight)setImageRatio(img.naturalWidth/img.naturalHeight);}} style={{width:geometry.width+'%',height:geometry.height+'%',left:geometry.left+'%',top:geometry.top+'%'}}/></div>;
}
