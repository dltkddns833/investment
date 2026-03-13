import type { NewsArticle } from "@/lib/data";

const categoryConfig: Record<string, { color: string; icon: string }> = {
  경제: {
    color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
    icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  },
  글로벌: {
    color: "bg-purple-500/10 text-purple-300 border-purple-500/20",
    icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  정책: {
    color: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  },
  산업: {
    color: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
  },
  기업: {
    color: "bg-blue-500/10 text-blue-300 border-blue-500/20",
    icon: "M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  },
  "금융/보험": {
    color: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20",
    icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  },
  "통신/IT": {
    color: "bg-indigo-500/10 text-indigo-300 border-indigo-500/20",
    icon: "M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z",
  },
  "제약/바이오": {
    color: "bg-pink-500/10 text-pink-300 border-pink-500/20",
    icon: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  },
  "건설/부동산": {
    color: "bg-orange-500/10 text-orange-300 border-orange-500/20",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  },
  "소비재/유통": {
    color: "bg-teal-500/10 text-teal-300 border-teal-500/20",
    icon: "M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z",
  },
};

const defaultConfig = {
  color: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  icon: "M7 20l4-16m2 16l4-16M6 9h14M4 15h14",
};

function CategoryBadge({ category }: { category: string }) {
  const cfg = categoryConfig[category] ?? defaultConfig;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border ${cfg.color}`}
    >
      <svg
        className="w-2.5 h-2.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d={cfg.icon}
        />
      </svg>
      {category}
    </span>
  );
}

export default function NewsCard({ article }: { article: NewsArticle }) {
  return (
    <div className="bg-white/[0.02] hover:bg-white/[0.05] rounded-lg p-3 transition-all duration-200 hover:-translate-y-0.5">
      {article.url ? (
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-sm hover:text-blue-300 transition-colors"
        >
          {article.title}
        </a>
      ) : (
        <div className="font-medium text-sm">{article.title}</div>
      )}
      <div className="text-xs text-gray-400 mt-1">{article.summary}</div>
      <div className="flex items-center gap-2 mt-2">
        <CategoryBadge category={article.category} />
        <span className="text-xs text-gray-500">{article.source}</span>
        {article.url && (
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-600 hover:text-blue-400 transition-colors ml-auto"
          >
            원문 &rarr;
          </a>
        )}
      </div>
    </div>
  );
}
