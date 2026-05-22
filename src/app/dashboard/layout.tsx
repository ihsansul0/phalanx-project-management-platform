import React from "react";
import Link from "next/link";
import { UserButton, OrganizationSwitcher } from "@clerk/nextjs";
import { Settings } from "lucide-react";
import { auth } from "@clerk/nextjs/server";
import { api } from "~/trpc/server";
import { SidebarLinks, TopbarBreadcrumb, MobileMenu } from "~/components/shared/DashboardNav";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // 1. Fetch user workspace security context directly on the server
    const { orgId } = await auth();

    // 2. Safely pull database project nodes linked to this tenant scope
    let projects: { id: string; name: string }[] = [];
    if (orgId) {
        try {
            projects = await api.project.getAll();
        } catch (error) {
            console.error("Layout data fetch fallback event:", error);
        }
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground antialiased">

            {/* SIDEBAR NAVIGATION APP SHELL FRAME (Hidden on mobile viewports via hidden md:flex) */}
            <aside className="hidden md:flex h-full w-64 flex-col bg-[#050505] border-r border-r-border shrink-0 select-none">
                {/* Brand Identity / Switcher Module */}
                <div className="flex h-14 items-center justify-between border-b border-border px-4 gap-2">
                    {/* Phalanx Phi Monogram */}
                    <div className="flex items-center gap-2.5 overflow-hidden shrink-0 select-none">
                        <svg
                            className="h-5 w-5 text-white shrink-0"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            {/* The Aspis (Shield Perimeter) - Perfect Geometric Circle */}
                            <circle cx="12" cy="12" r="8" />

                            {/* The Sarissa (Executing Pike) - Continuous Vertical Axis */}
                            <path d="M12 2v20" />
                        </svg>
                        <span className="font-mono text-xs font-black tracking-[0.2em] text-white uppercase pl-0.5">
                            Phalanx
                        </span>
                    </div>

                    <OrganizationSwitcher
                        hidePersonal
                        organizationProfileMode="navigation"
                        organizationProfileUrl="/dashboard/settings?tab=workspace"
                        afterSelectOrganizationUrl="/dashboard"
                    />
                </div>

                {/* Hydrated Client Navigation Rails */}
                <nav className="flex-1 px-3 py-4 overflow-y-auto">
                    <SidebarLinks projects={projects} />
                </nav>

                {/* Configuration Footer Component Link */}
                <div className="border-t border-border p-3">
                    <Link
                        href="/dashboard/settings"
                        className="flex items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-white/5 hover:text-foreground transition-all"
                    >
                        <Settings className="h-4 w-4 text-muted-foreground/60" />
                        Settings
                    </Link>
                </div>
            </aside>

            {/* MAIN PORT ENGINE DISPLAY AREA */}
            <div className="flex flex-1 flex-col h-full overflow-hidden">

                {/* THE LIVE CONTEXT HEADER BAR (Adjusted padding on mobile) */}
                <header className="flex h-14 items-center justify-between border-b border-border bg-[#050505] md:bg-background/50 md:backdrop-blur-md px-4 md:px-6 shrink-0 gap-4 z-40">
                    {/* Reactive Multi-tier Navigation Trail */}
                    {/* Reactive Navigation Area holding Mobile Toggle and Breadcrumbs */}
                    <div className="flex items-center gap-3 min-w-0">
                        <MobileMenu projects={projects} />
                        <TopbarBreadcrumb projects={projects} />
                    </div>

                    {/* Secure Session Execution Trigger */}
                    <div className="flex items-center gap-4 shrink-0">
                        <UserButton
                            userProfileMode="navigation"
                            userProfileUrl="/dashboard/settings?tab=account"
                        />
                    </div>
                </header>

                {/* THE LIVE RUNTIME CANVAS CONTAINER (Comfortable adaptive padding values) */}
                <main className="flex-1 overflow-y-auto bg-background p-4 md:p-6">
                    {children}
                </main>

            </div>
        </div>
    );
}