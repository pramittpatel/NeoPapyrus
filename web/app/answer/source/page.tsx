import { Suspense } from "react";
import SourceView from "@/components/SourceView";

export default function SourcePage() {
  return (
    <Suspense>
      <SourceView />
    </Suspense>
  );
}
