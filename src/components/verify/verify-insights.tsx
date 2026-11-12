"use client";

import { motion } from "framer-motion";
import { AdminPane } from "@/components/admin/admin-bento";
import { fadeUp, stagger, verifyEase } from "@/components/verify/verify-motion";

type Suspicion = {
  score: number;
  level: string;
  parts: { key: string; label: string; points: number }[];
};

type Insights = {
  suspicion: Suspicion | null;
  heatmap: { days: number; grid: number[][]; tz: string } | null;
  blockedCountries: { country: string; count: number }[];
  blockedAsns: { asn: string; count: number }[];
  sources: { key: string; label: string; count: number }[];
};

type Audit = {
  id: string;
  action: string;
  actor: string;
  ip: string | null;
  detail: string | null;
  createdAt: string;
};

export function VerifyInsightsPane({ insights }: { insights: Insights | null }) {
  if (!insights) {
    return (
      <motion.p
        className="text-sm text-[var(--ad-muted)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        인사이트를 불러오는 중…
      </motion.p>
    );
  }
  const maxHeat = Math.max(1, ...(insights.heatmap?.grid.flat() || [1]));

  return (
    <motion.div className="grid gap-4" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={fadeUp}>
        <AdminPane title="의심 점수">
          {insights.suspicion ? (
            <div>
              <motion.p
                className="text-4xl font-black tracking-tight text-[var(--ad-text)]"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
              >
                {insights.suspicion.score}
                <span className="ml-2 text-sm font-medium uppercase text-[var(--ad-muted)]">
                  {insights.suspicion.level}
                </span>
              </motion.p>
              <div className="mt-4 flex flex-wrap gap-2">
                {insights.suspicion.parts.map((p, i) => (
                  <motion.span
                    key={p.key}
                    className="admin-chip rounded-full px-3 py-1 text-xs"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.05 * i, ease: verifyEase }}
                  >
                    {p.label} +{p.points}
                  </motion.span>
                ))}
                {!insights.suspicion.parts.length ? (
                  <span className="text-sm text-[var(--ad-muted)]">위험 신호 없음</span>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--ad-muted)]">PRO 이상에서 의심 점수를 볼 수 있어요.</p>
          )}
        </AdminPane>
      </motion.div>

      <motion.div variants={fadeUp}>
        <AdminPane title="시간대별 인증 히트맵 (UTC 7일)">
          {insights.heatmap ? (
            <div className="overflow-x-auto">
              <div className="inline-grid gap-0.5" style={{ gridTemplateColumns: `repeat(24, 12px)` }}>
                {insights.heatmap.grid.flatMap((row, di) =>
                  row.map((v, hi) => (
                    <motion.div
                      key={`${di}-${hi}`}
                      title={`D${di} ${hi}시: ${v}`}
                      className="size-3 rounded-[2px]"
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: (di * 24 + hi) * 0.002, duration: 0.25 }}
                      whileHover={{ scale: 1.35 }}
                      style={{
                        background: `rgba(52,211,153,${0.12 + (v / maxHeat) * 0.88})`,
                      }}
                    />
                  )),
                )}
              </div>
              <p className="mt-2 text-[11px] text-[var(--ad-subtle)]">행=최근 7일, 열=0–23시</p>
            </div>
          ) : (
            <p className="text-sm text-[var(--ad-muted)]">PRO 이상 기능</p>
          )}
        </AdminPane>
      </motion.div>

      <div className="grid gap-4 lg:grid-cols-3">
        <motion.div variants={fadeUp}>
          <AdminPane title="차단 국가 Top">
            <BarList
              rows={insights.blockedCountries.map((c) => ({
                label: c.country,
                count: c.count,
              }))}
            />
          </AdminPane>
        </motion.div>
        <motion.div variants={fadeUp}>
          <AdminPane title="차단 ASN Top">
            <BarList
              rows={insights.blockedAsns.map((c) => ({ label: c.asn, count: c.count }))}
              empty="PRO MAX 또는 데이터 없음"
            />
          </AdminPane>
        </motion.div>
        <motion.div variants={fadeUp}>
          <AdminPane title="유입 소스">
            <BarList
              rows={insights.sources.map((s) => ({ label: s.label, count: s.count }))}
              empty="채널/캠페인 데이터 없음"
            />
          </AdminPane>
        </motion.div>
      </div>
    </motion.div>
  );
}

function BarList({
  rows,
  empty = "데이터 없음",
}: {
  rows: { label: string; count: number }[];
  empty?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="text-sm text-[var(--ad-muted)]">{empty}</p>;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span className="font-mono text-[var(--ad-text)]">{r.label}</span>
            <span className="text-[var(--ad-muted)]">{r.count}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <motion.div
              className="h-full rounded-full bg-emerald-400/80"
              initial={{ width: 0 }}
              animate={{ width: `${(r.count / max) * 100}%` }}
              transition={{ delay: 0.05 * i, duration: 0.55, ease: verifyEase }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function VerifyAuditPane({ audits }: { audits: Audit[] }) {
  if (!audits.length) {
    return (
      <AdminPane title="감사 로그">
        <p className="text-sm text-[var(--ad-muted)]">
          아직 기록이 없거나 PRO 미만 플랜입니다. 로그인·설정·복구키·멤버 삭제가 여기에 쌓입니다.
        </p>
      </AdminPane>
    );
  }
  return (
    <AdminPane title={`감사 로그 ${audits.length}`}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-[10px] uppercase tracking-wide text-[var(--ad-muted)]">
            <tr>
              <th className="pb-2">액션</th>
              <th className="pb-2">행위자</th>
              <th className="pb-2">IP</th>
              <th className="pb-2">상세</th>
              <th className="pb-2">시각</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {audits.map((a, i) => (
              <motion.tr
                key={a.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(i, 12) * 0.03, ease: verifyEase }}
              >
                <td className="py-2 font-mono text-xs text-emerald-300/90">{a.action}</td>
                <td className="py-2 text-[var(--ad-muted)]">{a.actor}</td>
                <td className="py-2 font-mono text-xs">{a.ip || "—"}</td>
                <td className="py-2 text-xs text-[var(--ad-subtle)]">{a.detail || "—"}</td>
                <td className="py-2 text-xs text-[var(--ad-subtle)]">
                  {new Date(a.createdAt).toLocaleString("ko-KR", { hour12: false })}
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPane>
  );
}
