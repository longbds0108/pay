"use client";

import { EyeOff, FileLock2, Gavel, KeyRound, Lock, ScanEye, ShieldCheck, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { AsciiSeal } from "@/components/landing/ascii-seal";
import { FooterAscii } from "@/components/landing/footer-ascii";
import { Scramble } from "@/components/landing/scramble";
import { TenderState, blindBidAddress } from "@/lib/contracts";
import { EXPLORER_URL } from "@/lib/env";
import { useTenders } from "@/lib/hooks";
import "./landing.css";
import { IS_LOCAL_CHAIN, NETWORK_NAME } from "@/lib/network";

/*
 * Landing page in the Hedgora style (github.com/longbds0108/Defi): floating header with a sliding
 * section pill that flips dark/light per section, ASCII hero, sticky stacking cards, light bento
 * "protocol" section, four connected steps, "safe by design" panel, ASCII footer and route curtain.
 */

/** Sections tracked while scrolling (protocol is tracked so the pill hides there instead of lingering). */
const SECTIONS = ["lifecycle", "protocol", "how"] as const;
type SectionId = (typeof SECTIONS)[number];
/** Sections that have a nav item, in nav order. */
const NAV_SECTIONS: readonly SectionId[] = ["lifecycle", "how"];


const PHASES = [
  {
    index: "01",
    title: "Commit",
    subtitle: "Bidders post a hash of their offer",
    icon: Lock,
    glyph: "linear-gradient(135deg,#e8e3d5,#cfc6b0)",
    facts: [
      ["WHO", "Any wallet except the buyer"],
      ["ON-CHAIN", "Hash + encrypted file link"],
      ["PRICE READABLE BY", "No one"],
    ],
    foot: "UPDATE ANY TIME BEFORE THE SUBMISSION DEADLINE",
  },
  {
    index: "02",
    title: "Reveal",
    subtitle: "Each bidder opens their own seal",
    icon: KeyRound,
    glyph: "linear-gradient(135deg,#cfe2ff,#3f91ff)",
    facts: [
      ["WHO", "Each bidder"],
      ["PUBLISHED", "Amount, salt, key"],
      ["CHECKED BY", "The contract"],
    ],
    foot: "UNREVEALED BIDS ARE EXCLUDED · THEIR BOND GOES TO THE TREASURY, NOT THE BUYER",
  },
  {
    index: "03",
    title: "Award",
    subtitle: "The buyer decides — in public",
    icon: Trophy,
    glyph: "linear-gradient(135deg,#e8e3d5,#9576ea)",
    facts: [
      ["WHO", "The buyer"],
      ["ON-CHAIN", "Winner + reason link"],
      ["VERIFIABLE BY", "Anyone"],
    ],
    foot: "ONLY A REVEALED BID CAN WIN · ANYONE CAN RECOMPUTE EVERY HASH IN THE BROWSER",
  },
] as const;

const STEPS = [
  { icon: Gavel, title: "Publish", text: "A buyer posts the scope (on IPFS), budget range and deadlines on-chain." },
  { icon: FileLock2, title: "Seal", text: "Bidders commit a hash of their price; proposals are encrypted in the browser." },
  { icon: EyeOff, title: "Reveal", text: "After the deadline, bidders open their bids and the contract checks every hash." },
  { icon: ShieldCheck, title: "Prove", text: "The award and a link to its reason are public. Anyone can verify each revealed bid." },
];

const STACK = ["Arc", "Circle USDC", "Solidity", "OpenZeppelin", "Foundry", "IPFS", "viem", "wagmi", "RainbowKit", "WebCrypto"];

export default function LandingPage() {
  const router = useRouter();
  const headerRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState<SectionId | null>(null);
  const [light, setLight] = useState(false);
  const [curtain, setCurtain] = useState(false);
  const pendingNav = useRef(false);

  // Route curtain, then enter the app (Hedgora "LAUNCH APP").
  const launch = useCallback(
    (e?: MouseEvent, to = "/dashboard") => {
      e?.preventDefault();
      if (curtain) return;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setCurtain(true);
      window.setTimeout(() => router.push(to), reduce ? 150 : 650);
    },
    [curtain, router],
  );

  // Scroll reveal (the hero entrance is CSS-only, see .js-rise)
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = document.querySelectorAll(
      ".bb-life__rail > *, .bb-proto__head, .bb-proto__card, .bb-proto__infra, .bb-steps__head, .bb-step, .bb-sec__left, .bb-sec__card",
    );
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    els.forEach((el) => {
      el.classList.add("sr");
      io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  // Header: active section pill, dark/light flip, fade out over the footer
  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      const header = headerRef.current;
      if (!header) return;
      const sample = 112;
      const themed = Array.from(document.querySelectorAll<HTMLElement>("[data-header-theme]"));
      const current = themed.filter((s) => {
        const r = s.getBoundingClientRect();
        return r.top <= sample && r.bottom > sample;
      });
      const section = current[current.length - 1] ?? themed[0];
      setLight(section?.dataset.headerTheme === "light");

      const footer = document.getElementById("footer");
      const exit = footer ? Math.max(0, Math.min(1, (sample - footer.getBoundingClientRect().top) / sample)) : 0;
      header.style.setProperty("--hdr-offset", `${exit * -112}px`);
      header.style.setProperty("--hdr-opacity", String(1 - exit));
      header.style.pointerEvents = exit >= 0.98 ? "none" : "";

      if (!pendingNav.current) {
        const line = window.innerHeight * 0.42;
        let next: SectionId | null = null;
        for (const id of SECTIONS) {
          const el = document.getElementById(id);
          if (el && el.getBoundingClientRect().top <= line) next = id;
        }
        setActive(next);
      }
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const goTo = (id: SectionId) => (e: MouseEvent) => {
    e.preventDefault();
    pendingNav.current = true;
    setActive(id);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.setTimeout(() => (pendingNav.current = false), 700);
  };

  const activeIndex = active ? NAV_SECTIONS.indexOf(active) : -1;

  return (
    <div className="bb-landing">
      <header ref={headerRef} className={`bb-lheader ${light ? "bb-lheader--light" : "bb-lheader--dark"}`}>
        <button type="button" className="bb-brand" aria-label="Hedgora — back to top" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
          <BrandLogo onLight={light} priority className="bb-brand__logo" />
        </button>
        <nav className="bb-lnav" aria-label="Landing page" style={{ ["--nav-index" as string]: Math.max(0, activeIndex) }}>
          <span className={`bb-lnav__pill${activeIndex < 0 ? " is-hidden" : ""}`} aria-hidden="true" />
          <a href="#lifecycle" className={active === "lifecycle" ? "is-active" : undefined} onClick={goTo("lifecycle")}>
            LIFECYCLE
          </a>
          <a href="#how" className={active === "how" ? "is-active" : undefined} onClick={goTo("how")}>
            HOW IT WORKS
          </a>
          <Link href="/docs">DOCS</Link>
        </nav>
        <div className="bb-lheader__right">
          <a href="/dashboard" className="bb-action bb-action--compact bb-ring" onClick={(e) => launch(e)}>
            LAUNCH APP
          </a>
        </div>
      </header>

      <main>
        {/* ───────── Hero ───────── */}
        <section className="bb-hero bb-theme-dark" data-header-theme="dark">
          <div className="bb-hero__copy">
            <p className="bb-kicker js-rise">SEALED-BID TENDERS · {NETWORK_NAME.toUpperCase()}</p>
            <h1 className="js-rise">
              Bid in public
              <br />
              Price in
              <br />
              private
            </h1>
            <p className="bb-hero__body js-rise d1">
              Publish a public tender. Any wallet except the buyer can submit a bid, and every price stays a sealed hash
              until the submission deadline — enforced by the Hedgora smart contract, not by a promise.
            </p>
            <div className="bb-hero__actions js-rise d2">
              <a href="/dashboard" className="bb-action bb-ring" onClick={(e) => launch(e)}>
                LAUNCH APP
              </a>
              <a href="/marketplace" className="bb-textlink" onClick={(e) => launch(e, "/marketplace")}>
                Browse open tenders →
              </a>
            </div>
            <LiveStats />
          </div>
          <div className="bb-hero__visual">
            <AsciiSeal />
          </div>
        </section>

        {/* ───────── Lifecycle ───────── */}
        <section id="lifecycle" className="bb-life bb-theme-dark" data-header-theme="dark">
          <div className="bb-life__rail">
            <p className="bb-kicker">{"// THE LIFECYCLE"}</p>
            <h2>
              Open to all
              <br />
              Sealed to
              <br />
              everyone
            </h2>
            <p>
              Every phase change is decided by block time inside the Hedgora contract. The website only shows the clock —
              it can&apos;t open a bid early, and neither can the buyer. Eligibility is described by the buyer and checked
              at evaluation, not on-chain.
            </p>
          </div>
          <div className="bb-life__cards">
            {PHASES.map((p) => (
              <article key={p.index} className="bb-phase bb-ring bb-ring--rgy">
                <div className="bb-phase__top">
                  <span>{p.index}</span>
                  <span>
                    <i className="bb-dot" />
                    ENFORCED ON-CHAIN
                  </span>
                </div>
                <div className="bb-phase__identity">
                  <span className="bb-phase__glyph" style={{ background: p.glyph }}>
                    <p.icon />
                  </span>
                  <div>
                    <h3>{p.title}</h3>
                    <p>{p.subtitle}</p>
                  </div>
                </div>
                <div className="bb-phase__facts">
                  {p.facts.map(([k, v]) => (
                    <div key={k}>
                      <span>{k}</span>
                      <strong>{v}</strong>
                    </div>
                  ))}
                </div>
                <p className="bb-phase__foot">{p.foot}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ───────── Protocol (light) ───────── */}
        <section id="protocol" className="bb-proto bb-theme-light" data-header-theme="light">
          <div className="bb-proto__head">
            <div>
              <span className="bb-proto__kicker">{"// The protocol"}</span>
              <h2 className="bb-proto__title">
                <Scramble text="Prices nobody can read until everyone can" />
              </h2>
              <a className="bb-proto__cta" href="#how" onClick={goTo("how")}>
                See how it works <span className="bb-proto__cta-arrow" aria-hidden="true">→</span>
              </a>
            </div>
            <p className="bb-proto__lead">
              Hedgora replaces &ldquo;trust the portal&rdquo; with cryptography: a commitment fixes each price before the
              deadline, proposals are encrypted in the bidder&apos;s browser, and the contract — not a server — decides
              when anything opens.
            </p>
          </div>

          <div className="bb-proto__grid">
            <article className="bb-proto__card bb-proto__card--feature bb-ring">
              <div className="bb-proto__top">
                <span className="bb-proto__num">01</span>
                <h3>Sealed by math</h3>
              </div>
              <p className="bb-proto__desc">
                Change one digit and the hash no longer matches. Copy someone else&apos;s and it fails too.
              </p>
            </article>
            <article className="bb-proto__card bb-ring">
              <div className="bb-proto__top">
                <span className="bb-proto__num">02</span>
                <h3>Encrypted proposals</h3>
              </div>
              <p className="bb-proto__desc">AES-256-GCM in the browser before upload. The key is published only at reveal.</p>
            </article>
            <article className="bb-proto__card bb-ring">
              <div className="bb-proto__top">
                <span className="bb-proto__num">03</span>
                <h3>Deadlines in code</h3>
              </div>
              <p className="bb-proto__desc">Phases follow block time. Late bids and early reveals simply revert.</p>
            </article>
          </div>

          <div className="bb-proto__infra">
            <p className="bb-proto__infra-lead">Built with</p>
            <div className="bb-marquee">
              <div className="bb-marquee__track">
                {[...STACK, ...STACK].map((name, i) => (
                  <span key={i} className="bb-marquee__item" aria-hidden={i >= STACK.length}>
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ───────── How it works ───────── */}
        <section id="how" className="bb-steps bb-theme-dark" data-header-theme="dark">
          <div className="bb-steps__head">
            <span className="bb-steps__kicker">{"// How it works"}</span>
            <h2 className="bb-steps__title">From tender to proof in four steps</h2>
          </div>
          <div className="bb-steps__row">
            {STEPS.map((s, i) => (
              <article key={s.title} className="bb-step bb-ring bb-ring--rgy">
                <div className="bb-step__top">
                  <span className="bb-step__icon" aria-hidden="true">
                    <s.icon />
                  </span>
                  <span className="bb-step__num">0{i + 1}</span>
                </div>
                <div className="bb-step__body">
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </article>
            ))}
            <span className="bb-steps__spark" aria-hidden="true" />
          </div>
        </section>

        {/* ───────── Safe by design (light) ───────── */}
        <section className="bb-sec bb-theme-light" data-header-theme="light">
          <div className="bb-sec__panel">
            <div className="bb-sec__left">
              <span className="bb-sec__badge" aria-hidden="true">
                <ShieldCheck />
              </span>
              <span className="bb-sec__kicker">Safe by design</span>
              <h2 className="bb-sec__title">
                Your price stays yours
                <br />
                Until the deadline says otherwise
              </h2>
              <p className="bb-sec__body">
                Your amount, salt and document key never leave your browser before you reveal. Only the hash goes on-chain
                and only the encrypted proposal is uploaded — the buyer, the website and the RPC node see nothing readable.
              </p>
              <a href="/dashboard" className="bb-sec__cta" onClick={(e) => launch(e)}>
                Launch app <span aria-hidden="true">→</span>
              </a>
            </div>
            <div className="bb-sec__cards">
              {[
                { icon: Lock, title: "Only a hash on-chain", text: "Your salt and key stay in a backup file you download, plus a copy in your browser." },
                { icon: ScanEye, title: "Same rules for every bidder", text: "No one can read a competitor’s price before the submission deadline." },
                { icon: ShieldCheck, title: "Verifiable by anyone", text: "The results page recomputes each commitment from the revealed values." },
              ].map((c) => (
                <div key={c.title} className="bb-sec__card">
                  <span className="bb-sec__card-icon" aria-hidden="true">
                    <c.icon />
                  </span>
                  <div>
                    <h3>{c.title}</h3>
                    <p>{c.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── Footer ───────── */}
        <footer id="footer" className="bb-footer bb-theme-dark" data-header-theme="dark">
          <div className="bb-footer__inner">
            <div className="bb-footer__main">
              <div className="bb-footer__brand">
                <span className="bb-brand">
                  <BrandLogo className="bb-brand__logo bb-brand__logo--footer" />
                </span>
                <p className="bb-footer__desc">
                  Public confidential bidding for Arc. Any wallet can bid on a public tender; prices stay sealed until the
                  submission deadline.
                </p>
              </div>
              <div className="bb-footer__nav">
              <nav className="bb-footer__col" aria-label="Product">
                <h4>Product</h4>
                <Link href="/marketplace">Marketplace</Link>
                <Link href="/tenders/new">Create tender</Link>
                <Link href="/my/bids">My bids</Link>
                <Link href="/dashboard">Dashboard</Link>
              </nav>
              <nav className="bb-footer__col" aria-label="Resources">
                <h4>Resources</h4>
                <a href={EXPLORER_URL} target="_blank" rel="noreferrer">
                  Arc explorer ↗
                </a>
                <a href="https://faucet.circle.com" target="_blank" rel="noreferrer">
                  USDC faucet ↗
                </a>
                <a href="#how" onClick={goTo("how")}>
                  How it works
                </a>
                <Link href="/docs">Docs</Link>
              </nav>
              </div>
            </div>
          </div>
          <div className="bb-footer__wordband">
            <FooterAscii />
            <span className="bb-footer__wordmark" aria-hidden="true">
              HEDGORA
            </span>
          </div>
          <div className="bb-footer__bottombar">
            <span>© 2026 Hedgora</span>
          </div>
        </footer>
      </main>

      <div className={`bb-curtain${curtain ? " is-active" : ""}`} aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <i key={i} style={{ ["--i" as string]: i }} />
        ))}
        <span>HEDGORA / ENTERING THE MARKET</span>
      </div>
    </div>
  );
}

/** Live counters read from the contract (only when it is configured). */
function LiveStats() {
  const { rows, isLoading, error } = useTenders();
  if (!blindBidAddress || error) return null;
  // Never show placeholder zeros: numbers appear only once they have been read from the chain.
  const ready = !isLoading;
  const show = (n: number) => (ready ? n : "…");
  const open = rows.filter((r) => r.state === TenderState.Open).length;
  const sealed = rows.reduce((n, r) => n + r.tender.bidCount, 0);
  return (
    <p className="bb-hero__stats">
      <span>
        <i className="bb-dot" />
        <b>{show(rows.length)}</b>tenders
      </span>
      <span>
        <b>{show(open)}</b>open now
      </span>
      <span>
        <b>{show(sealed)}</b>sealed bids
      </span>
      <span>read live from {IS_LOCAL_CHAIN ? "a local test chain (test data)" : "Arc Testnet"}</span>
    </p>
  );
}
