"use client";

import { useEffect, useRef, useState } from "react";

/** The project description at the title level (client feedback: it belongs with the name, not
 * buried in the Details card), clamped to 3 lines. The Show more/Show less toggle only renders
 * when the clamped text actually overflows -- measured against the live element so it tracks
 * viewport resizes too. */
export function ProjectDescription({ text }: { text: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Only measure while clamped -- expanded text never scroll-overflows, and collapsing the
    // toggle away mid-read would strand the user in the expanded state.
    const check = () => {
      if (!expanded) setOverflows(el.scrollHeight > el.clientHeight + 1);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text, expanded]);

  return (
    <div className="max-w-3xl">
      <p
        ref={ref}
        className={`text-sm text-muted-foreground ${expanded ? "" : "line-clamp-3"}`}
      >
        {text}
      </p>
      {(overflows || expanded) && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 text-xs font-medium text-foreground/70 hover:text-foreground"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}
