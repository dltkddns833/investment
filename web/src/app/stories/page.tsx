import { getAllDailyStories } from "@/lib/data";
import StoryArchive from "@/components/StoryArchive";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const allStories = await getAllDailyStories();

  return (
    <div className="max-w-4xl mx-auto">
      <StoryArchive allStories={allStories} />
    </div>
  );
}
