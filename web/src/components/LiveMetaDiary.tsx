interface Props {
  diary: string | null;
  date: string;
}

export default function LiveMetaDiary({ diary, date }: Props) {
  if (!diary) return null;

  return (
    <section className="rounded-xl bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent border-l-2 border-l-purple-400/50 p-4 md:p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">📓</span>
        <h2 className="text-sm font-bold text-purple-300">메타 매니저 일기</h2>
        <span className="text-xs text-gray-500">{date}</span>
      </div>
      <p className="text-sm text-gray-300 leading-relaxed italic whitespace-pre-line">
        &ldquo;{diary}&rdquo;
      </p>
    </section>
  );
}
