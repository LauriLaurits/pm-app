export function ComingSoon({ tab }: { tab: string }) {
  return (
    <div className="rounded-xl border border-dashed p-12 text-center text-muted-foreground">
      {tab} is coming later in this phase.
    </div>
  );
}
