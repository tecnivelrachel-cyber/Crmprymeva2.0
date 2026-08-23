import { SkeletonBlock, SkeletonCards, SkeletonList } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div className="animate-fade-in space-y-5">
      <div className="space-y-2">
        <SkeletonBlock className="h-7 w-56" />
        <SkeletonBlock className="h-3 w-80" />
      </div>
      <SkeletonCards count={4} />
      <SkeletonList rows={5} />
    </div>
  );
}
