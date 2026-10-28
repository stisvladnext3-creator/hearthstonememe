import {afterEach,expect,it,vi} from 'vitest';
import {pcmSound,soundSamples,SOUND_RATE,SOUND_MAX_MS,ENTRANCE_NAMES} from './play-media';
import {entranceFor,usesCardEntrance} from './visual-effects';
import {normalizeCustomCard} from './custom-schema';
import {newCustomCard,registerCardPack,packForCards,validateCardPack} from './custom-cards';
import {copyCardTemplate} from './custom-presets';
import {createGame,act} from './engine';
import {stageAction,resolveCast} from './card-play';
import {roomGameView,validRoomView,ROOM_PROTOCOL} from '../online/protocol';
import {CARD} from './cards';
import {makePublication,validatePublication} from '../community/model';
import {sign,verify} from '../community/signature';
afterEach(()=>vi.unstubAllGlobals());
const tone=()=>pcmSound(Float32Array.from({length:1600},(_,i)=>Math.sin(i/9)*.5),'Голос.mp3');
it('keeps the exact selected animation and sound through normalization, JSON, template copies and room projections',()=>{
 const c=newCustomCard();c.editor!.animation='nature';c.editor!.sound=tone();const normalized=normalizeCustomCard(c)!;expect(normalized.editor!.sound).toEqual(c.editor!.sound);expect(entranceFor(normalized)).toBe('nature');
 registerCardPack([c]);expect(validateCardPack(JSON.parse(JSON.stringify(packForCards([c.id]))))[0]).toEqual(normalized);const copy=copyCardTemplate(c);expect(copy.id).not.toBe(c.id);expect(copy.editor!.sound).toEqual(c.editor!.sound);expect(copy.editor!.animation).toBe('nature');
 const g=createGame();g.customCards=[normalized];g.player.hand=[{id:c.id,uid:g.nextUid++}];for(const side of ['player','bot'] as const){const view=roomGameView(g,side);expect(validRoomView(view)).toBe(true);expect(view.customCards?.[0].editor?.sound).toEqual(c.editor!.sound);}expect(ROOM_PROTOCOL).toBe(11);
});
it('supports each of the twelve explicit effects and preserves automatic legacy defaults',()=>{
 const c=newCustomCard(),before=entranceFor(c);for(const id of Object.keys(ENTRANCE_NAMES)){const raw={...c,editor:{...c.editor,animation:id}};expect(normalizeCustomCard(raw)?.editor?.animation).toBe(id);}
 expect(normalizeCustomCard(c)?.editor).not.toHaveProperty('animation');expect(entranceFor(c)).toBe(before);expect(normalizeCustomCard({...c,editor:{...c.editor,animation:'unknown'}})).toBeNull();
});
it('keeps animation and audio covered by a community publication signature',async()=>{
 const c=newCustomCard();c.editor!.animation='void';c.editor!.sound=tone();registerCardPack([c]);
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']),key=await crypto.subtle.exportKey('jwk',keys.publicKey),owner='a'.repeat(64),p=makePublication(owner,{kind:'card',title:'Звуковая карта',author:'Тестер',description:'',roots:[c.id]}),signature=await sign(p,{owner,key,privateKey:keys.privateKey});
 const received=validatePublication(JSON.parse(JSON.stringify(p)));expect(await verify(received,key,signature)).toBe(true);expect(received.cards[0].editor!.sound).toEqual(c.editor!.sound);
 received.cards[0].editor!.animation='flame';expect(await verify(received,key,signature)).toBe(false);
});
it('encodes bounded mono PCM, clamps samples and retains signed values without executing an arbitrary audio URL',()=>{
 const clip=pcmSound(new Float32Array([-2,-.5,0,.5,2]),'clip.wav'),samples=soundSamples(clip)!;expect([...samples]).toEqual([-32768,-16384,0,16384,32767]);expect(clip.duration).toBe(1);
 expect(soundSamples({...clip,data:'https://example.com/track.mp3'})).toBeNull();expect(soundSamples({...clip,data:'data:audio/wav;base64,PHNjcmlwdD4='})).toBeNull();expect(soundSamples({...clip,name:'bad\nname'})).toBeNull();expect(soundSamples({...clip,duration:5000})).toBeNull();
 const full=pcmSound(new Float32Array(SOUND_RATE*8),'long.wav');expect(full.duration).toBe(SOUND_MAX_MS);expect(soundSamples(full)).toHaveLength(SOUND_RATE*5);
});
it('rejects malformed container headers, wrong rates and corrupted custom sound definitions',()=>{
 const sound=tone(),bytes=Uint8Array.from(atob(sound.data.split(',')[1]),c=>c.charCodeAt(0));new DataView(bytes.buffer).setUint32(24,44100,true);const bad={...sound,data:'data:audio/wav;base64,'+btoa(String.fromCharCode(...bytes))};expect(soundSamples(bad)).toBeNull();
 const c=newCustomCard();for(const value of [bad,{...sound,duration:-1},{...sound,name:'x'.repeat(81)},'file.mp3'])expect(normalizeCustomCard({...c,editor:{...c.editor,sound:value}})).toBeNull();
});
it('restores the original immediate effects of all five native hero powers',()=>{
 for(const hero of ['mage','warrior','warlock','storm','cat'] as const){const g=createGame(undefined,12,undefined,undefined,{player:hero});g.active='player';g.player.mana=g.player.maxMana=10;const action=hero==='mage'?{type:'power' as const,target:'hero' as const}:{type:'power' as const};const direct=act(g,'player',action),staged=stageAction(g,'player',action,10000);expect(staged.error).toBeUndefined();expect(staged.state).toEqual(direct.state);expect(staged.state.casting).toBeUndefined();}
 expect(usesCardEntrance(CARD['spark-power'])).toBe(false);
});
it('lets a custom power opt into a selected entrance while preserving its rules and the real 1.5 second delay',()=>{
 const c={...newCustomCard(),kind:'power' as const,attack:undefined,health:undefined};c.editor!.animation='frost';c.editor!.sound=tone();registerCardPack([c]);const g=createGame();g.active='player';g.player.mana=g.player.maxMana=10;g.player.power=c.id;g.customCards=[c];
 const staged=stageAction(g,'player',{type:'power'},10000).state;expect(staged.casting?.cardId).toBe(c.id);expect(staged.player.powerUsed).toBe(false);expect(resolveCast(staged,11500).player.powerUsed).toBe(true);
});
