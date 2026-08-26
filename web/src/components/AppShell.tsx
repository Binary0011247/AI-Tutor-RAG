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
  Home,
  LayoutGrid,
  Menu,
  PanelLeft,
  Settings,
  Sparkles,
} from "lucide-react";

const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "#classroom", label: "My Classroom", icon: LayoutGrid },
  { href: "#assignments", label: "Assignments", icon: ClipboardList },
  { href: "/exams", label: "Exams", icon: FileText, active: true },
  { href: "#library", label: "My Library", icon: BookOpen },
] as const;

function VedaWordmark({ compact }: { compact: boolean }) {
  return (
    <Link
      href="/"
      className={`flex min-w-0 items-center gap-2.5 ${compact ? "flex-col gap-1.5" : ""}`}
      aria-label="VedaAI home"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-ink text-[17px] font-bold leading-none text-white">
        V
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
          compact ? "flex-col gap-2 px-2 pt-3 pb-2" : "gap-1 px-3 pt-5 pb-1"
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

      <div className={`shrink-0 ${compact ? "mt-1 px-2" : "mt-6 px-3"}`}>
        <button
          type="button"
          className={`flex items-center rounded-full text-white ${
            compact
              ? "mx-auto h-10 w-10 justify-center bg-accent"
              : "w-full gap-2 border border-accent/80 bg-ink px-3 py-2.5 shadow-[0_0_0_1px_rgba(232,115,74,0.35)]"
          }`}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          {!compact ? (
            <span className="truncate text-sm font-semibold">
              AI Teacher&apos;s Toolkit
            </span>
          ) : (
            <span className="sr-only">AI Teacher&apos;s Toolkit</span>
          )}
        </button>
      </div>

      <nav
        className={`mt-2 flex flex-1 flex-col gap-0.5 ${
          compact ? "items-center px-1.5" : "px-2"
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
              <span key={item.label} className={className}>
                <Icon className="h-4 w-4 shrink-0" />
                {!compact ? item.label : <span className="sr-only">{item.label}</span>}
              </span>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href === "/exams" ? "/" : item.href}
              className={className}
              onClick={() => setMobileOpen(false)}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!compact ? item.label : <span className="sr-only">{item.label}</span>}
            </Link>
          );
        })}
        {!compact ? (
          <span className="mt-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted">
            <Settings className="h-4 w-4 shrink-0" />
            Settings
          </span>
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-xl text-muted">
            <Settings className="h-4 w-4" />
            <span className="sr-only">Settings</span>
          </span>
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
        className={`hidden shrink-0 border-r border-line bg-card md:flex md:flex-col ${
          collapsed ? "w-[72px]" : "w-[240px]"
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
          <aside className="relative z-10 flex h-full w-[240px] flex-col border-r border-line bg-card">
            {sidebar(false)}
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-card px-3 sm:gap-3 sm:px-4">
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
              className="hidden h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-line md:flex"
              aria-label="Help"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-line"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#e23d3d]" />
            </button>
            <button
              type="button"
              className="hidden h-8 w-8 items-center justify-center rounded-full text-accent hover:bg-line md:flex"
              aria-label="AI tools"
            >
              <Sparkles className="h-4 w-4" />
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 hover:bg-line sm:pr-2"
            >
              <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-[#c4ddd2] text-[11px] font-bold text-ink">
                MR
              </span>
              <span className="hidden text-sm font-medium text-ink lg:inline">
                Madhur Rastogi
              </span>
              <ChevronDown className="hidden h-4 w-4 text-muted md:block" />
            </button>
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
