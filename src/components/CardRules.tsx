// Match words independently of punctuation and inflection, including references
// to an ability elsewhere in a sentence (e.g. «с провокацией»).
const keyword = /(?<!\p{L})(боевой клич|предсмертный хрип|начало матча|провокаци[\p{L}]*|натиск[\p{L}]*|маскировк[\p{L}]*|громоздк[\p{L}]*|рывок|рывка|рывком|рывку|эхо|задача|награда|немот[\p{L}]*|раскоп[\p{L}]*|аур[аыуой]+|ВСЕХ)(?!\p{L})/giu;
export function CardRules({ text }: { text: string }) {
  return <>{text.split(keyword).map((part, i) => i % 2 ? <strong key={i}>{part}</strong> : part)}</>;
}
