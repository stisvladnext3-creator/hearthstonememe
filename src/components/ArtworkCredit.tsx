import { useArtwork } from '../artwork';

export default function ArtworkCredit({ cardId }: { cardId: string }) {
  const credit = useArtwork().images[cardId]?.credit;
  if (!credit) return null;
  return <p className="art-credit">Иллюстрация: <a href={credit.source} target="_blank" rel="noreferrer">{credit.title}</a> · {credit.author} · <a href={credit.licenseUrl} target="_blank" rel="noreferrer">{credit.license}</a></p>;
}
