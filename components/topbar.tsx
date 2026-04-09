type TopbarProps = {
  children?: React.ReactNode;
};

/** Optional top strip; renders nothing when `children` is omitted (same visual layout as before). */
export function Topbar({ children }: TopbarProps) {
  if (children == null) {
    return null;
  }

  return (
    <header className="flex shrink-0 items-center border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950 md:px-8">
      {children}
    </header>
  );
}
