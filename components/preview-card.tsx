import Image from "next/image";

type PreviewCardBase = {
  imageSrc: string;
  imageAlt: string;
  /** When false, caption/title/description use muted placeholder styling. */
  isFilled?: boolean;
};

export type PreviewCardInstagramProps = PreviewCardBase & {
  variant: "instagram";
  caption: string;
  hashtags: string;
};

export type PreviewCardPinterestProps = PreviewCardBase & {
  variant: "pinterest";
  title: string;
  description: string;
};

export type PreviewCardProps = PreviewCardInstagramProps | PreviewCardPinterestProps;

export function PreviewCard(props: PreviewCardProps) {
  if (props.variant === "instagram") {
    return <InstagramPreview {...props} />;
  }
  return <PinterestPreview {...props} />;
}

function mutedBody(isFilled: boolean | undefined): string {
  return isFilled
    ? "text-zinc-800 dark:text-zinc-200"
    : "italic text-zinc-400 dark:text-zinc-500";
}

function InstagramPreview({
  imageSrc,
  imageAlt,
  caption,
  hashtags,
  isFilled,
}: PreviewCardInstagramProps) {
  const body = mutedBody(isFilled);
  const tagMuted = isFilled
    ? "text-zinc-500 dark:text-zinc-400"
    : "italic text-zinc-400 dark:text-zinc-500";

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 dark:border-zinc-800">
        <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-200 dark:bg-zinc-700" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-50">Your shop</p>
          <p className="text-[10px] text-zinc-500">Sponsored</p>
        </div>
      </div>
      <div className="relative aspect-square w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        <Image src={imageSrc} alt={imageAlt} fill className="object-cover" sizes="300px" />
      </div>
      <div className="space-y-2 p-3">
        <p className={`text-xs leading-relaxed whitespace-pre-wrap ${body}`}>{caption}</p>
        <p className={`text-[11px] leading-snug ${tagMuted}`}>
          {hashtags.trim() ? hashtags : "Hashtags will appear here after you generate."}
        </p>
      </div>
    </div>
  );
}

function PinterestPreview({
  imageSrc,
  imageAlt,
  title,
  description,
  isFilled,
}: PreviewCardPinterestProps) {
  const titleCls = isFilled
    ? "text-sm font-semibold text-zinc-900 dark:text-zinc-50"
    : "text-sm font-semibold italic text-zinc-400 dark:text-zinc-500";
  const descCls = isFilled
    ? "text-xs leading-relaxed text-zinc-600 dark:text-zinc-400"
    : "text-xs leading-relaxed italic text-zinc-400 dark:text-zinc-500";

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-zinc-100 dark:bg-zinc-900">
        <Image src={imageSrc} alt={imageAlt} fill className="object-cover" sizes="300px" />
      </div>
      <div className="space-y-1 border-t border-zinc-100 p-3 dark:border-zinc-800">
        <p className={titleCls}>{title}</p>
        <p className={descCls}>{description}</p>
      </div>
    </div>
  );
}
