import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VMS — Vendor Onboarding Portal",
  description: "Self-service vendor onboarding with role-based access control.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
