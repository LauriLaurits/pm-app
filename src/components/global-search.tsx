"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2Icon, SearchIcon } from "lucide-react";
import { globalSearchAction, type SearchResultItem, type SearchSection } from "@/app/actions/search";
import { Input } from "@/components/ui/input";
import { PersonAvatar } from "@/components/person-avatar";
import { avatarTint } from "@/lib/avatar-tint";
import { PROJECT_ICONS } from "@/lib/project-icons";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 250;

/** Each row leads with its section's identity visual (user ask: "what is what" at a glance) --
 * projects get their icon tile, employees their PersonAvatar, clients a tinted initials chip.
 * Same visual language as the list pages, shrunk to dropdown size. */
function ResultVisual({ section, item }: { section: SearchSection["section"]; item: SearchResultItem }) {
  if (section === "Projects") {
    const Icon = PROJECT_ICONS[item.iconKey ?? "folder"].icon;
    return (
      <span
        aria-hidden
        className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/25 bg-muted/30 text-muted-foreground"
      >
        <Icon className="size-3.5" />
      </span>
    );
  }
  if (section === "Employees") {
    return <PersonAvatar name={item.label} avatarUrl={item.avatarUrl} className="size-7 shrink-0" />;
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-[10px] font-medium",
        avatarTint(item.label)
      )}
    >
      {item.label.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Header-mounted global search: debounced lookup across projects/clients/employees with a
 * grouped dropdown. Roving focus is a flat index over every result row (across sections) rather
 * than a full combobox primitive -- ArrowUp/Down walk that flat list, Enter navigates the active
 * row, Escape closes. A monotonically increasing request id guards against an earlier keystroke's
 * slower response clobbering a later one's results (the classic stale-response race with
 * debounced async search). */
export function GlobalSearch() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<SearchSection[]>([]);
  const [isPending, setIsPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const requestIdRef = useRef(0);

  const flatItems = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  // Only the debounced fetch dispatch lives here; every setState happens inside a callback (the
  // setTimeout body, then the promise .then) rather than synchronously in the effect body itself
  // -- the "too short, skip" case is handled by onChange below instead of an early setState here.
  useEffect(() => {
    const trimmed = query.trim();
    // Bump on every query transition, not just the >=2-char branch -- otherwise shortening/
    // clearing the query below 2 chars leaves requestIdRef untouched, so an in-flight request
    // from the previous (longer) query still matches on resolution and reopens the dropdown with
    // stale results even though onChange already closed it.
    const requestId = ++requestIdRef.current;
    if (trimmed.length < 2) return;

    const timeout = setTimeout(() => {
      globalSearchAction(trimmed).then((res) => {
        // Ignore out-of-order resolutions -- only the most recently fired request may commit.
        if (requestId !== requestIdRef.current) return;
        setSections(res.results);
        setIsPending(false);
        setOpen(true);
        setActiveIndex(0);
      }).catch(() => {
        if (requestId === requestIdRef.current) setIsPending(false);
      });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  function navigateTo(href: string) {
    setOpen(false);
    router.push(href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open && query.trim().length >= 2) {
        setOpen(true);
        return;
      }
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (!open) return;
      const active = flatItems[activeIndex];
      if (active) {
        e.preventDefault();
        navigateTo(active.href);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && query.trim().length >= 2;
  const hasResults = flatItems.length > 0;

  return (
    <div ref={containerRef} className="relative w-72 max-sm:w-full">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            const value = e.target.value;
            setQuery(value);
            const trimmed = value.trim();
            if (trimmed.length < 2) {
              setIsPending(false);
              setOpen(false);
            } else {
              setIsPending(true);
            }
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search projects, clients, people…"
          aria-label="Global search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls="global-search-results"
          aria-activedescendant={
            showDropdown && flatItems[activeIndex] ? `global-search-item-${flatItems[activeIndex].id}` : undefined
          }
          className="rounded-full border-transparent bg-muted/60 pr-8 pl-8 shadow-none"
        />
        {isPending && (
          <Loader2Icon className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {showDropdown && (
        <div
          id="global-search-results"
          role="listbox"
          className="absolute top-full z-50 mt-1 max-h-96 w-full overflow-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
        >
          {!hasResults && !isPending && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No results for &ldquo;{query.trim()}&rdquo;</p>
          )}
          {sections.map((section) => (
            <div key={section.section} className="py-1">
              <p className="px-3 py-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {section.section}
              </p>
              {section.items.map((item) => {
                const flatIndex = flatItems.indexOf(item);
                const active = flatIndex === activeIndex;
                return (
                  <Link
                    key={item.id}
                    id={`global-search-item-${item.id}`}
                    href={item.href}
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(flatIndex)}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm",
                      active ? "bg-accent text-accent-foreground" : "hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <ResultVisual section={section.section} item={item} />
                    <span className="min-w-0">
                      <span className="block truncate">{item.label}</span>
                      {item.sublabel && (
                        <span className="block truncate text-xs text-muted-foreground">{item.sublabel}</span>
                      )}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
