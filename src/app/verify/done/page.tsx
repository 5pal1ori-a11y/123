import { Suspense } from "react";
import { VerifyDoneClient } from "@/components/verify/verify-done-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "인증 결과 · DOES Verify",
};

export default function VerifyDonePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-[#05060a] text-neutral-500">
          불러오는 중…
        </div>
      }
    >
      <VerifyDoneClient />
    </Suspense>
  );
}
