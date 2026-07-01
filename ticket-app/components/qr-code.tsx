"use client";

import { useEffect, useRef } from "react";
import QRCode from "qrcode";

interface QRCodeDisplayProps {
  /** The URL or text to encode in the QR code. */
  url: string;
  /** Width/height of the QR code canvas in pixels. Default 256. */
  size?: number;
}

/**
 * Client component that renders a QR code as a canvas element.
 * Uses the `qrcode` library to generate the QR code on the client side.
 *
 * No server-side rendering — the canvas is rendered after mount.
 */
export function QRCodeDisplay({ url, size = 256 }: QRCodeDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: size,
        margin: 2,
        color: {
          dark: "#1a1a1a",
          light: "#ffffff",
        },
      });
    }
  }, [url, size]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="QR code do ingresso"
      role="img"
      style={{ maxWidth: "100%", height: "auto" }}
    />
  );
}