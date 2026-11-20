"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, Loader2, ShieldCheck, ShieldAlert, Upload, Clock } from "lucide-react";

type StatusResp = {
  required: boolean;
  status: "pending" | "approved" | "rejected" | null;
  verified: boolean;
  rejectReason: string | null;
  submittedAt: string | null;
};

type Phase = "loading" | "form" | "uploading" | "pending" | "approved" | "error";

function fileToBase64(file: File): Promise<{ base64: string; type: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const comma = result.indexOf(",");
      resolve({ base64: comma >= 0 ? result.slice(comma + 1) : result, type: file.type });
    };
    reader.onerror = () => reject(new Error("파일을 읽지 못했어요."));
    reader.readAsDataURL(file);
  });
}

export function IdentityVerifyClient() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [message, setMessage] = useState("");
  const [rejectReason, setRejectReason] = useState<string | null>(null);
  const [realName, setRealName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/identity-verify/status", { credentials: "include" });
      if (res.status === 401) {
        setPhase("error");
        setMessage("먼저 사이트에 로그인해 주세요.");
        return;
      }
      const data = (await res.json()) as StatusResp;
      if (data.status === "approved") {
        setPhase("approved");
      } else if (data.status === "pending") {
        setPhase("pending");
      } else {
        if (data.status === "rejected") setRejectReason(data.rejectReason);
        setPhase("form");
      }
    } catch {
      setPhase("error");
      setMessage("상태를 불러오지 못했어요.");
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const pick = (f: File | null) => {
    setMessage("");
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/i.test(f.type)) {
      setMessage("이미지 파일(JPG·PNG·WEBP)만 올릴 수 있어요.");
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setMessage("사진이 너무 커요. 4MB 이하로 올려 주세요.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const submit = useCallback(async () => {
    if (!file) {
      setMessage("신분증 사진을 선택해 주세요.");
      return;
    }
    setPhase("uploading");
    setMessage("");
    try {
      const { base64, type } = await fileToBase64(file);
      const res = await fetch("/api/identity-verify/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ imageBase64: base64, imageType: type, realName: realName.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setPhase("form");
        setMessage(data?.error || "업로드에 실패했어요. 다시 시도해 주세요.");
        return;
      }
      setPhase("pending");
    } catch {
      setPhase("form");
      setMessage("네트워크 오류로 업로드하지 못했어요.");
    }
  }, [file, realName]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-6 px-4 py-12">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-400/30">
          {phase === "approved" ? <ShieldCheck className="size-8" /> : phase === "error" ? <ShieldAlert className="size-8" /> : phase === "pending" ? <Clock className="size-8" /> : <BadgeCheck className="size-8" />}
        </div>
        <h1 className="text-xl font-bold text-white">본인인증</h1>
        <p className="text-sm text-slate-400">
          안전한 거래를 위해 신분증 사진으로 본인확인을 해요.
          <br />
          관리자 확인 후 승인되며, 사진은 승인 즉시 삭제됩니다.
        </p>
      </div>

      {phase === "loading" && (
        <div className="flex items-center gap-2 text-slate-400">
          <Loader2 className="size-4 animate-spin" /> 불러오는 중…
        </div>
      )}

      {phase === "approved" && (
        <div className="w-full rounded-2xl bg-emerald-500/10 p-5 text-center text-sm text-emerald-200 ring-1 ring-emerald-400/30">
          <ShieldCheck className="mx-auto mb-2 size-6" />
          본인인증이 완료됐어요. 이제 코인대행을 이용할 수 있어요.
        </div>
      )}

      {phase === "pending" && (
        <div className="w-full rounded-2xl bg-amber-500/10 p-5 text-center text-sm text-amber-200 ring-1 ring-amber-400/30">
          <Clock className="mx-auto mb-2 size-6" />
          검토 중이에요. 관리자가 확인하면 알려 드릴게요. (보통 수 분 ~ 수 시간)
        </div>
      )}

      {(phase === "form" || phase === "uploading") && (
        <div className="w-full space-y-4">
          {rejectReason && (
            <div className="rounded-xl bg-rose-500/10 px-4 py-3 text-sm text-rose-200 ring-1 ring-rose-400/30">
              이전 신청이 반려됐어요: {rejectReason}
              <br />새 사진으로 다시 신청해 주세요.
            </div>
          )}

          <input
            type="text"
            placeholder="실명 (신분증과 동일하게)"
            value={realName}
            onChange={(e) => setRealName(e.target.value)}
            className="w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-400/50"
          />

          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />

          <button
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-slate-300 transition hover:border-indigo-400/40 hover:bg-white/[0.04]"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="미리보기" className="max-h-44 rounded-lg object-contain" />
            ) : (
              <>
                <Upload className="size-6" />
                <span className="text-sm">신분증 사진 선택 (주민증·운전면허·여권)</span>
                <span className="text-xs text-slate-500">JPG · PNG · WEBP · 4MB 이하</span>
              </>
            )}
          </button>

          <p className="text-xs text-slate-500">
            개인정보 보호를 위해 주민등록번호 뒷자리는 가리고 올리는 것을 권장해요.
          </p>

          <button
            onClick={submit}
            disabled={phase === "uploading" || !file}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-500 px-6 py-4 font-semibold text-white transition hover:bg-indigo-400 disabled:opacity-50"
          >
            {phase === "uploading" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> 올리는 중…
              </>
            ) : (
              <>본인인증 신청</>
            )}
          </button>

          {message && <p className="text-center text-sm text-rose-300">{message}</p>}
        </div>
      )}

      {phase === "error" && (
        <div className="w-full rounded-2xl bg-rose-500/10 p-4 text-center text-sm text-rose-200 ring-1 ring-rose-400/30">
          {message || "오류가 발생했어요."}
        </div>
      )}
    </div>
  );
}
