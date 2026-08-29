"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronsRight,
  ClipboardList,
  FileText,
  HelpCircle,
  LayoutGrid,
  Menu,
  PanelLeft,
  Settings,
  Sparkles,
} from "lucide-react";

const COMING_SOON = "Coming soon";

const NAV = [
  { href: "#classroom", label: "My Classroom", icon: LayoutGrid },
  { href: "#assignments", label: "Assignments", icon: ClipboardList },
  { href: "/", label: "Exams", icon: FileText, active: true },
  { href: "#library", label: "My Library", icon: BookOpen },
] as const;

function ComingSoonTip({
  side = "right",
}: {
  side?: "right" | "bottom";
}) {
  const position =
    side === "bottom"
      ? "top-full left-1/2 mt-2 -translate-x-1/2"
      : "left-full top-1/2 ml-2 -translate-y-1/2";
  return (
    <span
      role="tooltip"
      className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-xs font-medium text-white shadow-sm transition-opacity invisible opacity-0 group-hover:visible group-hover:opacity-100 group-focus-visible:visible group-focus-visible:opacity-100 ${position}`}
    >
      {COMING_SOON}
    </span>
  );
}

function VedaWordmark({ compact }: { compact: boolean }) {
  return (
    <Link
      href="/"
      className={`flex min-w-0 items-center gap-2.5 ${compact ? "flex-col gap-1.5" : ""}`}
      aria-label="VedaAI home"
    >
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[10px] bg-white shadow-sm ring-1 ring-line">
        <Image
          src="/vedaai-logo.avif"
          alt=""
          fill
          sizes="36px"
          className="object-cover"
          priority
        />
      </span>
      {!compact ? (
        <span className="truncate text-[21px] font-bold tracking-tight text-ink">
          VedaAI
        </span>
      ) : (
        <span className="sr-only">VedaAI</span>
      )}
    </Link>
  );
}

function SchoolCrest({ compact }: { compact: boolean }) {
  return (
    <div
      className={`mt-auto flex items-center gap-2.5 rounded-xl border border-line bg-card ${
        compact ? "justify-center p-2" : "px-2.5 py-2.5"
      }`}
    >
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white ring-1 ring-line">
        <Image
          src="/dps-logo.png"
          alt="Delhi Public School"
          fill
          sizes="36px"
          className="object-contain p-[3px]"
        />
      </span>
      {!compact ? (
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight text-ink">
            Delhi Public School,
          </p>
          <p className="truncate text-xs text-muted">Bokaro Steel City</p>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [userCollapsed, setUserCollapsed] = useState<boolean | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  const routeDefaultCollapsed = pathname.startsWith("/review");
  const collapsed = userCollapsed ?? routeDefaultCollapsed;

  const toggle = () => setUserCollapsed(!collapsed);

  const examsActive =
    pathname === "/" ||
    pathname.startsWith("/review") ||
    pathname.startsWith("/exams");

  const sidebar = (compact: boolean) => (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`flex shrink-0 items-center ${
          compact ? "flex-col gap-2 px-2 pt-3 pb-4" : "gap-1 px-3 pt-5 pb-3"
        }`}
      >
        <div className={compact ? "" : "min-w-0 flex-1"}>
          <VedaWordmark compact={compact} />
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink hover:bg-line"
        >
          <PanelLeft className="h-5 w-5" strokeWidth={1.75} />
        </button>
      </div>

      <div className={`shrink-0 ${compact ? "mt-4 px-2" : "mt-8 px-3"}`}>
        <button
          type="button"
          aria-label={`AI Teacher's Toolkit (${COMING_SOON.toLowerCase()})`}
          className={`group relative flex items-center rounded-full text-white ${
            compact
              ? "mx-auto h-11 w-11 justify-center bg-accent"
              : "w-full gap-2.5 border border-accent/80 bg-ink px-4 py-3 shadow-[0_0_0_1px_rgba(232,115,74,0.35)]"
          }`}
        >
          <Sparkles className="h-5 w-5 shrink-0" />
          {!compact ? (
            <span className="truncate text-[15px] font-semibold">
              AI Teacher&apos;s Toolkit
            </span>
          ) : (
            <span className="sr-only">AI Teacher&apos;s Toolkit</span>
          )}
          <ComingSoonTip side="right" />
        </button>
      </div>

      <nav
        className={`flex flex-1 flex-col gap-0.5 ${
          compact ? "mt-8 items-center px-1.5" : "mt-12 px-2"
        }`}
      >
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = "active" in item && item.active && examsActive;
          const className = compact
            ? `flex h-10 w-10 items-center justify-center rounded-xl ${
                active ? "bg-line text-ink" : "text-muted hover:bg-line/70 hover:text-ink"
              }`
            : `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${
                active
                  ? "bg-line text-ink"
                  : "text-muted hover:bg-line/70 hover:text-ink"
              }`;

          if (item.href.startsWith("#")) {
            return (
              <button
                key={item.label}
                type="button"
                aria-label={`${item.label} (${COMING_SOON.toLowerCase()})`}
                className={`group relative ${className}`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!compact ? item.label : <span className="sr-only">{item.label}</span>}
                <ComingSoonTip />
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              href="/"
              className={className}
              onClick={() => {
                setMobileOpen(false);
                setUserCollapsed(null);
              }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!compact ? item.label : <span className="sr-only">{item.label}</span>}
            </Link>
          );
        })}
        {!compact ? (
          <button
            type="button"
            aria-label={`Settings (${COMING_SOON.toLowerCase()})`}
            className="group relative mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted hover:bg-line/70 hover:text-ink"
          >
            <Settings className="h-4 w-4 shrink-0" />
            Settings
            <ComingSoonTip />
          </button>
        ) : (
          <button
            type="button"
            aria-label={`Settings (${COMING_SOON.toLowerCase()})`}
            className="group relative flex h-10 w-10 items-center justify-center rounded-xl text-muted hover:bg-line/70 hover:text-ink"
          >
            <Settings className="h-4 w-4" />
            <ComingSoonTip />
          </button>
        )}
      </nav>

      <div className={`${compact ? "px-2 pb-2" : "px-3 pb-3"}`}>
        <SchoolCrest compact={compact} />
        {compact ? (
          <button
            type="button"
            onClick={toggle}
            aria-label="Expand sidebar"
            className="mt-2 flex h-9 w-full items-center justify-center rounded-md text-muted hover:bg-line hover:text-ink"
          >
            <ChevronsRight className="h-5 w-5" />
          </button>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex h-[100dvh] bg-page">
      <aside
        className={`hidden shrink-0 overflow-visible border-r border-line bg-card md:flex md:flex-col ${
          collapsed ? "w-[72px]" : "w-[304px]"
        }`}
      >
        {sidebar(collapsed)}
      </aside>

      {mobileOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink/30"
            aria-label="Close menu"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative z-10 flex h-full w-[304px] flex-col border-r border-line bg-card">
            {sidebar(false)}
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-card px-3 sm:gap-3 sm:px-4">
          <button
            type="button"
            aria-label="Back"
            onClick={() => {
              if (pathname.startsWith("/review")) router.push("/");
              else router.back();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-md text-ink hover:bg-line"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <div className="md:hidden">
              <VedaWordmark compact={false} />
            </div>
            <div className="hidden items-center gap-2 text-sm font-medium text-ink md:flex">
              <FileText className="h-4 w-4 text-muted" />
              Exams
            </div>
          </div>
          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              className="group relative hidden h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-line md:flex"
              aria-label={`Help (${COMING_SOON.toLowerCase()})`}
            >
              <HelpCircle className="h-4 w-4" />
              <ComingSoonTip side="bottom" />
            </button>
            <button
              type="button"
              className="group relative flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-line"
              aria-label={`Notifications (${COMING_SOON.toLowerCase()})`}
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#e23d3d]" />
              <ComingSoonTip side="bottom" />
            </button>
            <button
              type="button"
              className="group relative hidden h-8 w-8 items-center justify-center rounded-full text-accent hover:bg-line md:flex"
              aria-label={`AI tools (${COMING_SOON.toLowerCase()})`}
            >
              <Sparkles className="h-4 w-4" />
              <ComingSoonTip side="bottom" />
            </button>
            <div className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 sm:pr-2">
              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#c4ddd2] text-[11px] font-bold text-ink">
                MR
              </span>
              <span className="hidden text-sm font-medium text-ink lg:inline">
                Madhur Rastogi
              </span>
              <ChevronDown className="hidden h-4 w-4 text-muted md:block" />
            </div>
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-md text-ink hover:bg-line md:hidden"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</div>
      </div>
    </div>
  );
}
