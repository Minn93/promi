type PlaceholderCardProps = {
  children: React.ReactNode;
};

/** Dashed outline panel for empty page placeholders (not social previews). */
export function PlaceholderCard({ children }: PlaceholderCardProps) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400">
      {children}
    </div>
  );
}
