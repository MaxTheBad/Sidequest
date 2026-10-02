import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LocalGuidePage from "@/components/local-guide-page";
import { getLocalGuide, LOCAL_GUIDES } from "@/content/local-guides";

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://questhat.com").replace(/\/$/, "");

export function generateStaticParams() {
  return LOCAL_GUIDES.map(({ slug }) => ({ slug }));
}

export function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  return params.then(({ slug }) => {
    const guide = getLocalGuide(slug);
    if (!guide) return {};
    const path = `/south-florida/${guide.slug}`;
    const image = `${siteUrl}/images/questhat-social-default.jpg`;
    return {
      title: guide.title,
      description: guide.description,
      alternates: { canonical: path },
      openGraph: { type: "website", url: path, siteName: "QuestHat", title: guide.title, description: guide.description, images: [{ url: image, width: 1200, height: 630, alt: `QuestHat — host a plan in ${guide.name}` }] },
      twitter: { card: "summary_large_image", title: guide.title, description: guide.description, images: [{ url: image, alt: `QuestHat — host a plan in ${guide.name}` }] },
    };
  });
}

export default async function SouthFloridaGuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = getLocalGuide(slug);
  if (!guide) notFound();
  const related = guide.related.map(getLocalGuide).filter((item): item is NonNullable<typeof item> => Boolean(item));
  return <LocalGuidePage guide={guide} related={related} />;
}
