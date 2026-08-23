import { SkeletonBlock, SkeletonList } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <div className="max-w-4xl animate-fade-in space-y-5">
      <div className="space-y-2">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-7 w-56" />
      </div>
      <SkeletonList rows={6} />
    </div>
  );
}
