"use client";

const PARTNERS = [
  "HostingKR",
  "Cloudflare",
  "Cursor",
  "Nest.js",
  "Google",
  "EmailJS",
];

function MarqueeTrack() {
  return (
    <>
      {PARTNERS.map((name) => (
        <span
          key={name}
          className="quartz-partner-pill shrink-0 rounded-full px-5 py-2 text-sm font-medium"
        >
          {name}
        </span>
      ))}
    </>
  );
}

export function PartnerMarquee() {
  return (
    <div className="group flex overflow-hidden p-2 [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)]">
      <div className="flex shrink-0 animate-marquee gap-4 pr-4 group-hover:[animation-play-state:paused]">
        <MarqueeTrack />
      </div>
      <div
        aria-hidden
        className="flex shrink-0 animate-marquee gap-4 pr-4 group-hover:[animation-play-state:paused]"
      >
        <MarqueeTrack />
      </div>
    </div>
  );
}
