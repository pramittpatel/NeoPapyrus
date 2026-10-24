import { Suspense } from "react";
import AnswerView from "@/components/AnswerView";

export default function AnswerPage() {
  return (
    <Suspense>
      <AnswerView />
    </Suspense>
  );
}
