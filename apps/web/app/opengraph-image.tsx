import { ImageResponse } from "next/og";

export const alt =
  "Lane4 HQ open beta. Seed times from best times, meet entries, and results for high school and club coaches.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#0e3c4e",
        color: "#e7f2f6",
        padding: "72px",
        fontFamily: "Georgia, serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 28, fontFamily: "sans-serif" }}>
        Lane4 HQ · Open beta
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        <div style={{ fontSize: 68, lineHeight: 1.05, maxWidth: 980 }}>
          The seed time is already on the roster.
        </div>
        <div
          style={{
            fontSize: 28,
            fontFamily: "sans-serif",
            color: "#d5e6ee",
            maxWidth: 860,
          }}
        >
          High school and club coaches. Export the file the host asked for.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div
          style={{
            display: "flex",
            height: 3,
            background: "#f3d36b",
            width: "100%",
          }}
        />
        <div
          style={{
            display: "flex",
            height: 3,
            background: "rgba(231,242,246,0.55)",
            width: "100%",
          }}
        />
        <div
          style={{
            display: "flex",
            height: 3,
            background: "rgba(231,242,246,0.55)",
            width: "100%",
          }}
        />
        <div
          style={{
            display: "flex",
            height: 3,
            background: "#f3d36b",
            width: "100%",
          }}
        />
      </div>
    </div>,
    { ...size },
  );
}
