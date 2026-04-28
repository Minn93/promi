import Link from "next/link";
import { EditScheduledPostForm } from "@/components/edit-scheduled-post-form";
import { getPostStatusCopy } from "@/lib/post-status-copy";
import { PageHeader } from "@/components/page-header";
import { prisma } from "@/lib/prisma";

type EditScheduledPostPageProps = {
  params: Promise<{ id: string }>;
};

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default async function EditScheduledPostPage({ params }: EditScheduledPostPageProps) {
  const { id } = await params;
  const postId = id?.trim() ?? "";

  if (!postId || !isUuid(postId)) {
    return (
      <>
        <PageHeader title="Edit scheduled post" description="Update a scheduled post before publishing." />
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          Invalid post id. Go back to{" "}
          <Link href="/scheduled" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
            Scheduled
          </Link>
          .
        </div>
      </>
    );
  }

  const post = await prisma.scheduledPost.findUnique({
    where: { id: postId },
    select: {
      id: true,
      productName: true,
      scheduledAt: true,
      status: true,
      contentPayload: true,
    },
  });

  if (!post) {
    return (
      <>
        <PageHeader title="Edit scheduled post" description="Update a scheduled post before publishing." />
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          Scheduled post not found. Go back to{" "}
          <Link href="/scheduled" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
            Scheduled
          </Link>
          .
        </div>
      </>
    );
  }

  if (post.status !== "scheduled") {
    return (
      <>
        <PageHeader title="Edit scheduled post" description="Update a scheduled post before publishing." />
        <div className="rounded-xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
          Only posts in <span className="font-medium">{getPostStatusCopy("scheduled").label}</span> status can be edited.
          This post is currently <span className="font-medium">{getPostStatusCopy(post.status).label}</span>.{" "}
          <Link href="/scheduled" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-zinc-50">
            Back to Scheduled
          </Link>
          .
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Edit scheduled post" description="Update a scheduled post before publishing." />
      <EditScheduledPostForm
        post={{
          id: post.id,
          productName: post.productName,
          scheduledAt: post.scheduledAt.toISOString(),
          contentPayload: post.contentPayload,
        }}
      />
    </>
  );
}
