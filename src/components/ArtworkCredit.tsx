import { useArtwork } from '../artwork';
import { CARD } from '../game/cards';

export default function ArtworkCredit({ cardId }: { cardId: string }) {
  const images = useArtwork().images;
  const credit = (images[cardId] ?? images[CARD[cardId]?.editor?.artSourceId ?? ''])?.credit;
  if (!credit) return null;
  return <p className="art-credit">Иллюстрация: <a href={credit.source} target="_blank" rel="noreferrer">{credit.title}</a> · {credit.author} · <a href={credit.licenseUrl} target="_blank" rel="noreferrer">{credit.license}</a></p>;
}
