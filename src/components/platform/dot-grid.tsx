export function DotGrid() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full fill-white/[0.08] [mask-image:radial-gradient(ellipse,rgba(0,0,0,0.2)_28%,black_58%)]"
    >
      <defs>
        <pattern
          id="vendix-dot-grid"
          width="20"
          height="20"
          patternUnits="userSpaceOnUse"
          patternContentUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#vendix-dot-grid)" strokeWidth="0" />
    </svg>
  );
}
