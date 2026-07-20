"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CheckIcon, CopyIcon, KeyRoundIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyCredentialAction, revealCredentialAction } from "@/app/actions/credential-reveal";

const REVEAL_SECONDS = 30;
const MASK = "••••••••••••";

/**
 * The only place in the app that ever holds a decrypted secret client-side, and only for up to
 * REVEAL_SECONDS. Rendered instead of the plain mask for `reveal_credential` holders only --
 * see credentials-list.tsx, which decides canReveal server-side and never mounts this component
 * for anyone else. State here is intentionally NOT lifted/cached anywhere: the secret lives only
 * in this component's local state, cleared on timeout AND on unmount (so navigating away from
 * the tab re-masks immediately, since React unmounts this on route change).
 */
export function CredentialRevealControl({
  projectId,
  credentialId,
}: {
  projectId: string;
  credentialId: string;
}) {
  const [secret, setSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(REVEAL_SECONDS);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function clearCountdown() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  // Auto re-mask on unmount (covers navigating away from this tab/page) as well as on the
  // REVEAL_SECONDS timeout started in handleReveal below.
  useEffect(() => clearCountdown, []);

  function handleReveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealCredentialAction(projectId, credentialId);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setSecret(result.secret);
      setSecondsLeft(REVEAL_SECONDS);
      clearCountdown();
      intervalRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearCountdown();
            setSecret(null);
            setCopied(false);
            return REVEAL_SECONDS;
          }
          return s - 1;
        });
      }, 1000);
    });
  }

  async function handleCopy() {
    if (!secret) return;
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Fire-and-forget audit -- never blocks or fails the copy itself (see doc comment on
    // copyCredentialAction).
    void copyCredentialAction(projectId, credentialId);
  }

  if (secret) {
    return (
      <span className="flex flex-wrap items-center gap-1.5 font-mono tabular-nums">
        <KeyRoundIcon className="size-3" />
        <span className="select-all">{secret}</span>
        <Button size="icon-sm" variant="ghost" onClick={handleCopy} aria-label="Copy secret">
          {copied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
        </Button>
        <span className="font-sans text-muted-foreground">re-masks in {secondsLeft}s</span>
      </span>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <span className="flex items-center gap-1 font-mono tabular-nums">
        <KeyRoundIcon className="size-3" />
        {MASK}
      </span>
      <Button size="sm" variant="ghost" onClick={handleReveal} disabled={isPending}>
        {isPending ? "Revealing…" : "Reveal"}
      </Button>
      {error && <span className="text-destructive">{error}</span>}
    </span>
  );
}
