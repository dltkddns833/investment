import { getAllNews } from "@/lib/data";
import NewsArchive from "@/components/NewsArchive";

export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const allNews = await getAllNews();

  return (
    <div className="max-w-4xl mx-auto">
      <NewsArchive allNews={allNews} />
    </div>
  );
}
