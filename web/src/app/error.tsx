"use client";

export default function RootError({
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
          데이터를 불러오는 중 오류가 발생했습니다
        </h2>
        <p className="text-gray-400 text-sm mb-6">
          {error.message || "잠시 후 다시 시도해주세요."}
        </p>
        <button
          onClick={reset}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
