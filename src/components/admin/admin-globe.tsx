"use client";

export function AdminGlobe() {
  return (
    <div className="qx-globe relative mx-auto aspect-square w-full max-w-[260px]">
      <div className="qx-globe-stars absolute inset-[-18%] rounded-full" />
      <div className="qx-globe-halo absolute inset-[-10%] rounded-full" />
      <div className="qx-globe-atm absolute inset-[2%] rounded-full" />
      <div className="qx-globe-sphere absolute inset-[10%] overflow-hidden rounded-full">
        <div className="qx-globe-map" />
        <div className="qx-globe-grid" />
        <div className="qx-globe-shade" />
        <div className="qx-globe-spec" />
      </div>
      <div className="qx-globe-equator" />
      <div className="qx-globe-ring absolute inset-[4%] rounded-full" />
      <div className="qx-globe-ring-outer absolute inset-[-8%] rounded-full" />
      <div className="qx-globe-sat" />
    </div>
  );
}
