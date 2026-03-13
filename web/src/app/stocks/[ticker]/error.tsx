"use client";

import Link from "next/link";

export default function StockDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-white mb-2">
          종목 상세 정보를 불러올 수 없습니다
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          {error.message || "잠시 후 다시 시도해주세요."}
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
          >
            다시 시도
          </button>
          <Link
            href="/stocks"
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            종목 목록
          </Link>
        </div>
      </div>
    </div>
  );
}
