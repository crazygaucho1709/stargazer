import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Stargazer · Scope Sensor",
  description: "Niveau, azimut et GPS pour mise en station NexStar 4SE",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Scope",
  },
  icons: {
    apple: "/icon-192.png",
    icon: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#020817",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function SensorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
