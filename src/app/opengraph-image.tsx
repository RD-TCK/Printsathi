import { ImageResponse } from "next/og";

export const alt = "Printiva — digital printing service: scan, upload, pay, print";
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
        padding: 72,
        background: "linear-gradient(135deg, #052e16 0%, #14532d 55%, #166534 100%)",
        color: "#ffffff",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>
        <span>Print</span>
        <span style={{ color: "#4ade80" }}>iva</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
          Digital printing service
        </div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
          for local print shops
        </div>
        <div style={{ display: "flex", marginTop: 28, fontSize: 34, color: "#bbf7d0" }}>
          Scan the QR · Upload · Pay · Print
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 26, color: "#86efac" }}>
        No app. No WhatsApp. Prints straight from your phone.
      </div>
    </div>,
    size,
  );
}
