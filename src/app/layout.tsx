import "~/styles/globals.css";

import { type Metadata } from "next";
import { Geist } from "next/font/google";

import { TRPCReactProvider } from "~/trpc/react";
// 1. Import the Bouncer's Badge
import { ClerkProvider } from "@clerk/nextjs";
// 2. Import our new Theme Engine
import { ThemeProvider } from "~/components/theme-provider";

export const metadata: Metadata = {
  title: {
    default: "Phalanx",
    template: "Phalanx // %s",
  },
  description: "Orchestrate complex development cycles with zero-trust multi-tenant isolation.",
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // Wrap the entire app in the fully unified ClerkProvider
    <ClerkProvider
      appearance={{
        // THE RE-SKIN ENGINE: Using explicit hex targets to force portal visibility
        variables: {
          colorPrimary: "#ffffff",
          colorBackground: "#050505",
          colorText: "#f5f5f5",
          colorTextSecondary: "#a3a3a3",
          colorInputBackground: "#0a0a0a",
          colorInputText: "#ffffff",
          colorBorder: "#262626", // Explicit neutral-800 hex forces internal section dividers to draw!
          borderRadius: "0.3rem",
        },
        elements: {
          // Foundational Structural Outer Cards
          card: "border border-neutral-800 bg-[#050505] shadow-none",

          // FLOATING PORTAL POPUPS (Fixes dropdown outlines)
          userButtonPopoverCard: "border border-neutral-800 bg-[#050505] shadow-xl",
          organizationSwitcherPopoverCard: "border border-neutral-800 bg-[#050505] shadow-xl",

          // FULL ACCOUNT MODAL VIEWS (Fixes popup background frames)
          userProfile: "bg-[#050505] border border-neutral-800 text-foreground",
          organizationProfile: "bg-[#050505] border border-neutral-800 text-foreground",

          // Inner Section Block Items
          socialButtonsBlockButton: "border border-neutral-800 hover:bg-white/5 transition-all text-sm font-medium",
          dividerLine: "bg-neutral-800",

          // Custom Trigger Buttons inside our App Shell layout
          organizationSwitcherTrigger: "text-foreground hover:bg-white/5 px-2 py-1 rounded transition-all border border-neutral-800 bg-neutral-900/30 text-xs font-medium max-w-[140px]",
          userButtonTrigger: "focus:shadow-none focus:outline-none focus:ring-0",

          // Typography scales & brand elements
          headerTitle: "tracking-tight font-bold",
          headerSubtitle: "text-xs font-mono text-muted-foreground/60 tracking-normal",
          formButtonPrimary: "bg-white text-black hover:bg-neutral-200 font-semibold text-sm transition-all shadow-none",
          footerActionText: "text-xs text-muted-foreground",
          footerActionLink: "text-xs text-white hover:underline transition-all",
          dividerText: "font-mono text-[10px] text-muted-foreground/40 uppercase tracking-widest",
        },
      }}
    >
      {/* suppressHydrationWarning prevents the "Flash of Unstyled Content" error */}
      <html lang="en" className={`${geist.variable}`} suppressHydrationWarning>
        <body>
          <TRPCReactProvider>
            {/* The Dark Mode Lock */}
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem={false}
              disableTransitionOnChange
            >
              {children}
            </ThemeProvider>
          </TRPCReactProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}