import Image from "next/image";
import Link from "next/link";

type SocialLinkProps = {
  href: string;
  label: string;
  children: React.ReactNode;
};

function SocialLink({ href, label, children }: SocialLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`QuestHat on ${label}`}
      className="global-footer-social-link"
    >
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{label}</span>
    </a>
  );
}

export default function GlobalFooter() {
  return (
    <footer className="app-footer mt-16 border-t border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center gap-6 md:flex-row md:items-start md:justify-between">
          <div className="text-center md:text-left">
            <Link href="/" className="inline-flex items-center gap-2 font-semibold text-slate-800">
              <Image
                src="/questhat-logo.png"
                alt="QuestHat"
                width={30}
                height={16}
                className="h-5 w-auto"
              />
              <span>QuestHat</span>
            </Link>
            <p className="mt-2 max-w-xs text-sm leading-5 text-slate-500">Don’t wait to be invited. Host it.</p>
          </div>

          <nav aria-label="Footer" className="flex flex-wrap justify-center gap-x-5 gap-y-3 text-sm font-medium text-slate-600">
            <Link href="/south-florida/broward-county" className="global-footer-link">South Florida guides</Link>
            <Link href="/privacy" className="global-footer-link">Privacy Policy</Link>
            <Link href="/terms" className="global-footer-link">Terms of Service</Link>
            <Link href="/child-safety" className="global-footer-link">Child safety</Link>
            <Link href="/support" className="global-footer-link">Support</Link>
          </nav>

          <div className="flex w-full justify-center gap-3 md:w-auto" aria-label="QuestHat social profiles">
            <SocialLink href="https://www.instagram.com/questhatapp" label="Instagram">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
            </SocialLink>
            <SocialLink href="https://www.tiktok.com/@questhatapp" label="TikTok">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M15.7 3c.4 2.2 1.7 3.5 3.8 3.9v3.1c-1.4.1-2.7-.3-3.8-1v6.1a5.9 5.9 0 1 1-5.1-5.8v3.1a2.9 2.9 0 1 0 2.1 2.7V3h3Z" /></svg>
            </SocialLink>
            <SocialLink href="https://www.facebook.com/1263520396843577" label="Facebook">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M13.6 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.2v2.2H8v3.1h2.5v8h3.1Z" /></svg>
            </SocialLink>
            <SocialLink href="https://x.com/questhatapp" label="X">
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5"><path d="M18.9 3H22l-6.8 7.8L23.2 21h-6.3l-4.9-6.4L6.4 21H3.3l7.3-8.3L2.9 3h6.3l4.4 5.8L18.9 3Zm-1.1 16h1.7L8.3 4.9H6.5L17.8 19Z" /></svg>
            </SocialLink>
          </div>
        </div>
        <p className="mt-7 text-center text-xs text-slate-500">© {new Date().getFullYear()} QuestHat. All rights reserved.</p>
      </div>
    </footer>
  );
}
