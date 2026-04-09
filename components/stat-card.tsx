type StatCardProps = {
  children: React.ReactNode;
};

export function StatCard({ children }: StatCardProps) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
      {children}
    </div>
  );
}
