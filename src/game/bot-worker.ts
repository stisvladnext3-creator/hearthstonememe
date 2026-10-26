import { chooseBotAction } from './bot-ai';
import type { Game } from './engine';
self.onmessage = (event: MessageEvent<{request:number;game:Game}>) => {
  const {request,game}=event.data;
  try { self.postMessage({request,action:chooseBotAction(game)}); }
  catch { self.postMessage({request,error:true}); }
};
