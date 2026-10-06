import type { Metadata } from "next";
import "./globals.css";
import "./feedback-overhaul.css";
import "./feedback-minimal.css";
import PreferencesProvider from "./i18n";
import { preferenceBootstrap } from "./preferences-script";

export const metadata: Metadata = {
  title: "Feedback Drive | Your feedback, in focus",
  description: "A live feedback board. Share what you think, add photos, and see the conversation move forward.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><meta name="theme-color" content="#faf9f6" /><script dangerouslySetInnerHTML={{ __html: preferenceBootstrap }} /></head>
      <body className="antialiased"><PreferencesProvider>{children}</PreferencesProvider></body>
    </html>
  );
}
