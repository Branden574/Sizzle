import { useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** "The Menu" — playful FAQ accordion (cerealbnb-style, Sizzle voice). */
const FAQS = [
  { q: 'Is Sizzle actually free?', a: 'Completely. No ads, no subscription, no catch. We make money later — never off your data.' },
  { q: 'Do recipes really scale themselves?', a: 'Tap your serving count and every ingredient redoes the math on the spot. Cooking for 2 or for 12, the amounts are always right.' },
  { q: 'No ads — for real?', a: 'For real. Your feed feeds you, not advertisers. Zero ads, zero third-party tracking, ever.' },
  { q: 'Can I post my own recipes?', a: 'Record a clip, drop in the recipe, hit post. Creators keep their videos, their followers, and all the credit.' },
  { q: 'Where are the ten-paragraph life stories?', a: 'Nowhere to be found. You came for the recipe, so you get the recipe — clean, scaled, and ready for the stove.' },
];

/**
 * The Sizzle marketing website (the web "front door") — a faithful build of the
 * "Sizzle Landing" design: hero, a pinned 3D process deck (GSAP ScrollTrigger +
 * CSS perspective), a live serving scaler, feature grid, creators + roadmap,
 * trust, final CTA, and footer with real legal links. Distinct from the
 * phone-style app shell. CTAs route visitors to Get started / Log in.
 *
 * All styles are scoped under `.szl` so they can't leak into the app.
 */
export function Marketing({ onGetStarted, onLogin }: { onGetStarted: () => void; onLogin: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [servings, setServings] = useState(2);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Pinned 3D process deck — desktop + motion only; useGSAP auto-cleans up.
  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const wide = window.matchMedia('(min-width: 901px)').matches;
      const canScrub = window.matchMedia('(min-width: 760px)').matches;

      // Pinned 3D process deck — wide desktop only (the heaviest effect).
      const proc = wide ? root.current!.querySelector('.process') : null;
      if (proc) {
        proc.classList.add('is3d');
        const cards = gsap.utils.toArray<HTMLElement>('.step-card', root.current!);
        const FROM = { opacity: 0, z: -560, rotateX: -26, y: 170, scale: 0.86, filter: 'blur(6px)' };
        const ACTIVE = { opacity: 1, z: 0, rotateX: 0, y: 0, scale: 1, filter: 'blur(0px)' };
        const OUT = { opacity: 0, z: 260, rotateX: 16, y: -140, scale: 1.12, filter: 'blur(8px)' };
        cards.forEach((c, i) => {
          gsap.set(c, { transformOrigin: '50% 50%', zIndex: i + 1 });
          gsap.set(c, i === 0 ? ACTIVE : FROM);
        });
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: '.stage',
            start: 'top top',
            end: '+=' + cards.length * window.innerHeight,
            pin: '.stage',
            scrub: 0.7,
            anticipatePin: 1,
          },
        });
        for (let i = 0; i < cards.length - 1; i++) {
          const lbl = 's' + i;
          tl.addLabel(lbl, i)
            .to(cards[i], { ...OUT, ease: 'power2.inOut', duration: 0.9 }, lbl)
            .fromTo(cards[i + 1], FROM, { ...ACTIVE, ease: 'power2.out', duration: 0.9 }, lbl + '+=0.1');
        }
      }

      // Cinematic "feed to plate" clip: pin the section and scrub the video's
      // playhead from scroll progress (Apple-style scrollytelling). Runs on
      // tablet+/laptop; true-mobile keeps the autoplay-loop fallback.
      const cine = root.current!.querySelector<HTMLElement>('.cinema');
      const vid = root.current!.querySelector<HTMLVideoElement>('.cinema video');
      if (canScrub && cine && vid) {
        vid.pause();
        vid.removeAttribute('loop');
        vid.removeAttribute('autoplay');
        const seek = (p: number) => {
          const d = vid.duration || 10;
          vid.currentTime = Math.max(0, Math.min(d - 0.05, p * d));
        };
        ScrollTrigger.create({
          trigger: cine,
          start: 'top top',
          // ~29s clip → pin for ~4 screen-heights so the scrub paces comfortably.
          end: '+=' + window.innerHeight * 4,
          pin: true,
          // Tight scrub — the all-intra re-encode makes every frame seek
          // instantly, so we don't need much lerp (which itself reads as lag).
          scrub: 0.35,
          // This section is the first pinned block on the page, so its pin
          // spacer must be measured first — otherwise the two pins overlap.
          refreshPriority: 2,
          onUpdate: (self) => seek(self.progress),
        });
        vid.addEventListener('loadedmetadata', () => ScrollTrigger.refresh(), { once: true });
      }
    },
    { scope: root },
  );

  // serving scaler (base values are for 2 servings)
  const base = { egg: 1, miso: 1.5, mirin: 0.5, sesame: 1 };
  const frac = (x: number) => {
    const whole = Math.floor(x);
    const f = x - whole;
    let s = '';
    if (Math.abs(f - 0.5) < 0.02) s = '½';
    else if (Math.abs(f - 0.25) < 0.02) s = '¼';
    else if (Math.abs(f - 0.75) < 0.02) s = '¾';
    else if (Math.abs(f - 0.33) < 0.05) s = '⅓';
    else if (f > 0.02) return String(Math.round(x * 10) / 10);
    if (whole && s) return whole + ' ' + s;
    if (s) return s;
    return String(whole);
  };
  const k = servings / 2;
  const app = () => onGetStarted();

  return (
    <div className="szl" ref={root}>
      <style>{CSS}</style>
      <div className="grain" aria-hidden="true" />

      {/* NAV */}
      <nav className="nav">
        <div className="wrap row">
          <button className="brand linkbtn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <img src="/brand/sizzle-mark-flat.svg" alt="" width={28} height={35} style={{ display: 'block' }} />
            Sizzle
          </button>
          <div className="navlinks">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#creators">Creators</a>
            <a href="/privacy">Privacy</a>
            <button className="linkbtn login" onClick={onLogin}>Log in</button>
            <button className="btn btn-accent cta" onClick={app}>Get the app</button>
          </div>
        </div>
      </nav>

      {/* CINEMATIC SCROLL REVEAL (top) — Kling "feed to plate" clip, scrubbed by
          scroll on desktop; loops as a cinematic background on mobile / reduced-motion. */}
      <section className="cinema" aria-label="From feed to plate">
        <video
          className="cinemavid"
          src="/landing/feed-to-plate-3d.mp4"
          poster="/landing/feed-to-plate-3d-poster.jpg"
          muted
          playsInline
          autoPlay
          loop
          preload="auto"
        />
        <div className="cinemaveil" />
        <div className="cinemacap wrap">
          <span className="eyebrow">From feed to plate</span>
          <h2 className="serif">Scroll the feed.<br /><span className="hot ital">Watch it come to life.</span></h2>
        </div>
      </section>

      {/* HERO */}
      <header className="hero" id="top">
        <div className="wrap grid">
          <div>
            <span className="ticket"><span className="tdot" /> Live feed — <b>12,408 recipes</b> · 0 ads</span>
            <h1 className="serif">Watch it.<br />Then <span className="hot ital">actually</span><br />cook&nbsp;it.</h1>
            <p className="sub">Full-screen video recipes from real home cooks. Tap once and the clip becomes a clean recipe — already scaled to your servings and built for the stove. No ten-paragraph life stories. No ads. No tracking.</p>
            <div className="ctas">
              <button className="store" onClick={app}><span className="ico"></span><span><span className="l1">Download on the</span><br /><span className="l2">App Store</span></span></button>
              <button className="store" onClick={app}><span className="ico">▶</span><span><span className="l1">Get it on</span><br /><span className="l2">Google Play</span></span></button>
            </div>
            <button className="weblink linkbtn" onClick={app}>Or open the web app <span className="arr">→</span></button>
            <div className="madewith"><span className="ml">Made with</span> real home cooks · zero ads · no tracking · <em>just food</em></div>
          </div>
          <div className="phone-stage">
            <div className="phone"><div className="screen">
              <div className="feedbg" />
              <div className="ftabs"><span>Following</span><span className="on">For You</span></div>
              <div className="play"><svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></div>
              <div className="rail">
                <div className="av">MP<span className="plus">+</span></div>
                <div className="act"><svg width="26" height="26" viewBox="0 0 24 24" fill="#ff5a36"><path d="M12 21s-7-4.35-9.5-8.5C.8 9.4 2.3 6 5.5 6c2 0 3.2 1.2 3.9 2.3C10 7.2 11.2 6 13.2 6c3.2 0 4.7 3.4 3 6.5C19 16.65 12 21 12 21z" /></svg>48.2k</div>
                <div className="act"><svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-4.5A8.4 8.4 0 1 1 21 11.5z" /></svg>612</div>
                <div className="act"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M5 3h14v18l-7-5-7 5z" /></svg>Save</div>
              </div>
              <div className="caption">
                <div className="who">Mina Park <span>@minapark</span></div>
                <span className="chip">JAPANESE · 25:00 · ●●●○</span>
                <div className="title">Charred Miso<br />Eggplant</div>
              </div>
              <div className="progress" />
              <div className="viewrec">↑ View recipe</div>
            </div></div>
            <div className="float saved">
              <div className="mp">MP</div>
              <div><div className="t1">Recipe saved</div><div className="t2">Charred Miso Eggplant</div><div className="t3">Japanese · 25 min · Easy</div></div>
            </div>
            <div className="float cook"><div className="lab">COOK MODE</div><div className="tm">06:30</div><div className="cbar" /></div>
          </div>
        </div>
      </header>

      {/* PROCESS (3D) */}
      <section className="process" id="how">
        <div className="intro wrap">
          <span className="eyebrow">From scroll to supper</span>
          <h2 className="serif intro-h">Video to real recipe, in one tap.</h2>
          <div className="hint">Scroll to discover the flow ↓</div>
        </div>
        <div className="deck"><div className="stage">
          <article className="step-card dark">
            <div className="step-num">01</div>
            <div className="step-inner">
              <div>
                <div className="step-lab">The crave</div>
                <h3>Discover the dish.</h3>
                <p>Swipe a full-screen feed tuned to your taste — a personalized For You and a Following feed of real home cooks. No blogs, no clutter.</p>
              </div>
              <div className="phone-stage"><div className="phone"><div className="screen">
                <div className="feedbg" />
                <div className="ftabs" style={{ top: 18 }}><span>Following</span><span className="on">For You</span></div>
                <div className="play"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></div>
                <div className="rail" style={{ bottom: 96 }}>
                  <div className="av">MP<span className="plus">+</span></div>
                  <div className="act"><svg width="24" height="24" viewBox="0 0 24 24" fill="#ff5a36"><path d="M12 21s-7-4.35-9.5-8.5C.8 9.4 2.3 6 5.5 6c2 0 3.2 1.2 3.9 2.3C10 7.2 11.2 6 13.2 6c3.2 0 4.7 3.4 3 6.5C19 16.65 12 21 12 21z" /></svg>48.2k</div>
                  <div className="act"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-4.5A8.4 8.4 0 1 1 21 11.5z" /></svg>612</div>
                </div>
                <div className="caption" style={{ bottom: 30 }}><div className="who">Mina Park <span>@minapark</span></div><span className="chip">JAPANESE · 25 MIN</span><div className="title">Charred Miso<br />Eggplant</div></div>
              </div></div></div>
            </div>
          </article>

          <article className="step-card cream">
            <div className="step-num">02</div>
            <div className="step-inner">
              <div>
                <div className="step-lab">The tap</div>
                <h3>Open the recipe.</h3>
                <p>One tap turns any video into a clean, structured recipe — ingredients with quantities, numbered steps, cuisine, time and difficulty.</p>
              </div>
              <div className="phone-stage"><div className="phone"><div className="screen"><div className="scr">
                <div className="vid" />
                <div className="sbody">
                  <span className="mchip">JAPANESE</span>
                  <h4>Charred Miso Eggplant</h4>
                  <div className="meta3"><div className="m"><div className="kk">Time</div><div className="v">25 min</div></div><div className="m"><div className="kk">Serves</div><div className="v">2</div></div><div className="m"><div className="kk">Level</div><div className="v">Easy</div></div></div>
                  <div className="ing-h">Ingredients</div>
                  <div className="ing"><span className="idot" />2 globe eggplants</div>
                  <div className="ing"><span className="idot" />3 tbsp white miso</div>
                  <div className="ing"><span className="idot" />1 tbsp mirin · 1 tbsp sake</div>
                  <div className="scta">Start Cook Mode</div>
                </div>
              </div></div></div></div>
            </div>
          </article>

          <article className="step-card dark">
            <div className="step-num">03</div>
            <div className="step-inner">
              <div>
                <div className="step-lab">The math</div>
                <h3>Scale it to any table.</h3>
                <p>Type how many you're feeding and every quantity recalculates instantly. Push the whole list — already scaled — to your shopping list.</p>
              </div>
              <div className="phone-stage"><div className="phone"><div className="screen"><div className="scr dark">
                <div className="sbody">
                  <div className="sc-lab">Serving scaler</div>
                  <div className="stepper"><button>−</button><div className="cnt"><b>6</b><span>servings</span></div><button className="plus">+</button></div>
                  <div className="scr-row"><span>Globe eggplants</span><b>3</b></div>
                  <div className="scr-row"><span>White miso</span><b>4½ tbsp</b></div>
                  <div className="scr-row"><span>Mirin</span><b>1½ tbsp</b></div>
                  <div className="scr-row"><span>Toasted sesame</span><b>3 tsp</b></div>
                  <div className="scta accent">🛒 Add to shopping list</div>
                </div>
              </div></div></div></div>
            </div>
          </article>

          <article className="step-card cream">
            <div className="step-num">04</div>
            <div className="step-inner">
              <div>
                <div className="step-lab">The cook</div>
                <h3>Then cook it.</h3>
                <p>A big step-by-step Cook Mode with built-in timers that keeps your screen awake — so you can cook along hands-free, start to plate.</p>
              </div>
              <div className="phone-stage"><div className="phone"><div className="screen"><div className="cook-scr">
                <div className="cl">COOK MODE · STEP 4 OF 5</div>
                <div className="ins">Flip, brush generously with glaze, and broil until lacquered.</div>
                <div className="ring"><span>3:00</span></div>
                <div className="note">Built-in timer · screen stays awake</div>
                <div className="cook-btns"><div className="cb back">Back</div><div className="cb next">Next step</div></div>
              </div></div></div></div>
            </div>
          </article>
        </div></div>
      </section>


      {/* MANIFESTO + STATS */}
      <section className="manifesto"><div className="wrap">
        <span className="eyebrow">Why we built it</span>
        <h2 className="serif">The feed got so good at <span className="hot ital">keeping you scrolling</span> it forgot to feed you. So we built one that does.</h2>
        <div className="stats">
          <div className="stat"><div className="n">12,408</div><div className="l">recipes &amp; counting</div></div>
          <div className="stat"><div className="n">0</div><div className="l">ads, ever</div></div>
          <div className="stat"><div className="n">22<span>min</span></div><div className="l">average cook</div></div>
          <div className="stat"><div className="n">100<span>%</span></div><div className="l">real home cooks</div></div>
        </div>
      </div></section>

      {/* FEATURES */}
      <section className="sec" id="features"><div className="wrap">
        <div className="sec-head left">
          <span className="eyebrow">Built to actually cook</span>
          <h2 className="serif">More than a feed.<br />A kitchen companion.</h2>
        </div>

        <div className="feat-try">
          <div>
            <span className="eyebrow">Serving-size scaler · Try it</span>
            <h3 className="serif">Cooking for 2? Done.</h3>
            <p>Type how many people you're feeding and every quantity recalculates instantly. No mental math, no half-eggs.</p>
            <div className="stepper try">
              <button onClick={() => setServings((n) => Math.max(1, n - 1))}>−</button>
              <div className="cnt"><b>{servings}</b><span>servings</span></div>
              <button className="plus" onClick={() => setServings((n) => Math.min(20, n + 1))}>+</button>
            </div>
          </div>
          <div className="try-panel">
            <div className="scr-row"><span>Globe eggplants</span><b>{Math.round(base.egg * k)}</b></div>
            <div className="scr-row"><span>White miso</span><b>{frac(base.miso * k)} tbsp</b></div>
            <div className="scr-row"><span>Mirin</span><b>{frac(base.mirin * k)} tbsp</b></div>
            <div className="scr-row"><span>Toasted sesame</span><b>{frac(base.sesame * k)} tsp</b></div>
            <div className="scr-row muted"><span>🛒 Add all to shopping list</span><span /></div>
          </div>
        </div>

        <div className="fgrid">
          <div className="fcard"><div className="fi">⏱</div><h4>Cook Mode &amp; timers</h4><p>A big step-by-step view with built-in timers that keeps your screen awake while your hands are busy.</p></div>
          <div className="fcard"><div className="fi">📚</div><h4>Collections</h4><p>Group what you save into your own cookbooks — weeknight wins, weekend projects, the lot.</p></div>
          <div className="fcard"><div className="fi">🛒</div><h4>Shopping list</h4><p>Push a recipe's ingredients straight to a built-in shopping list, already scaled to your servings.</p></div>
          <div className="fcard"><div className="fi">★</div><h4>Foodie Reviews</h4><p>Two post types: cook-along recipes and honest food &amp; restaurant reviews you can rate.</p></div>
          <div className="fcard"><div className="fi">🔍</div><h4>Discover &amp; taste picker</h4><p>Search, hashtags, and trending tags — plus an onboarding taste picker that personalizes day one.</p></div>
          <div className="fcard"><div className="fi">📺</div><h4>Up to 4K, no ads</h4><p>Portrait &amp; landscape, autoplay, sound toggle, scrubber, hold-to-hide — all ad-free.</p></div>
        </div>
      </div></section>

      {/* CREATORS */}
      <section className="sec creators" id="creators"><div className="wrap">
        <div className="lead">
          <span className="eyebrow">For creators</span>
          <h2 className="serif">Share your food. Grow your following.</h2>
          <p>Record in-app or upload from your library, publish recipes or reviews, and build an audience around the food you love. Monetization is on the roadmap.</p>
        </div>
        <div className="roadmap-lab">The roadmap · 5 phases</div>
        <div className="road">
          <div className="rcard"><div className="rn">01</div><h5>Watch &amp; cook</h5><p>The core feed, recipes &amp; Cook Mode.</p></div>
          <div className="rcard"><div className="rn">02</div><h5>Create &amp; grow</h5><p>Posting, profiles, following.</p></div>
          <div className="rcard"><div className="rn">03</div><h5>Organize</h5><p>Collections &amp; shopping list.</p></div>
          <div className="rcard"><div className="rn">04</div><h5>Community</h5><p>Reviews, reposts, verification.</p></div>
          <div className="rcard last"><div className="rn">05</div><h5>Monetize</h5><p>Earn from the food you share.</p></div>
        </div>
      </div></section>

      {/* TRUST */}
      <section className="trust-sec"><div className="wrap">
        <h2 className="serif">No ads. No tracking.<br /><span className="hot ital">Just good food.</span></h2>
        <p>Privacy-first by design — no third-party tracking, ever. Built for everyone 13 and up.</p>
        <div className="trust-links"><a href="/privacy">Privacy Policy</a><span className="sep">·</span><a href="/terms">Terms of Service</a><span className="sep">·</span><a href="/cookie-policy">Cookie Policy</a></div>
      </div></section>

      {/* THE MENU — FAQ accordion */}
      <section className="menu-sec" id="menu"><div className="wrap">
        <span className="eyebrow">The menu</span>
        <h2 className="serif">Questions, <span className="hot ital">answered.</span></h2>
        <div className="menu-list">
          {FAQS.map((f, i) => (
            <div key={i} className={'faq' + (openFaq === i ? ' open' : '')}>
              <button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                <span className="q">{f.q}</span>
                <span className="pm">+</span>
              </button>
              <div className="a"><p>{f.a}</p></div>
            </div>
          ))}
        </div>
      </div></section>

      {/* FINAL CTA */}
      <section className="cta-sec"><div className="wrap"><div className="cta-card">
        <div className="b serif">Sizzle</div>
        <h2 className="serif">Recipes you can actually make.</h2>
        <p>Watch it. Scale it. Cook it. Free on iOS, Android, and the web.</p>
        <div className="ctas">
          <button className="store on-cream" onClick={app}><span className="ico"></span><span><span className="l1">Download on the</span><br /><span className="l2">App Store</span></span></button>
          <button className="store on-cream" onClick={app}><span className="ico">▶</span><span><span className="l1">Get it on</span><br /><span className="l2">Google Play</span></span></button>
        </div>
        <button className="weblink linkbtn" onClick={app}>Or open the web app <span className="arr">→</span></button>
      </div></div></section>

      {/* FOOTER — Nutrition Facts label */}
      <footer className="nutri-foot"><div className="wrap nwrap">
        <div className="nutri-label">
          <div className="nl-title">Nutrition Facts</div>
          <div className="nl-sub">1 serving per kitchen · Serving size: 1 hungry human</div>
          <div className="nl-amt">Amount per scroll</div>
          <div className="nl-cal"><span>Calories</span><span>∞</span></div>
          <div className="nl-dv">% Sizzle Value*</div>
          <div className="nl-row"><b>Real home cooks</b><span>100%</span></div>
          <div className="nl-row"><b>Flavor</b><span>200%</span></div>
          <div className="nl-row sub"><span>Recipes that actually slap</span><span>✓</span></div>
          <div className="nl-row"><b>Ads</b><span>0%</span></div>
          <div className="nl-row"><b>Tracking</b><span>0%</span></div>
          <div className="nl-row thickb"><b>Ten-paragraph life stories</b><span>0%</span></div>
          <div className="nl-note">* Percent Sizzle Values are based on a daily diet of zero ads and 100% real food. Your mileage may vary by appetite.</div>
        </div>
        <div className="nutri-links">
          <div className="brand serif">Sizzle</div>
          <p className="tag">Watch it. Then actually cook it. The home for real recipes from real home cooks — at getsizzle.app.</p>
          <div className="nutri-cols">
            <div><h6>Product</h6><a href="#how">How it works</a><a href="#features">Features</a><a href="#creators">For creators</a><button className="fl" onClick={app}>Get the app</button></div>
            <div><h6>The menu</h6><a href="#menu">FAQ</a><a href="/contact">Contact</a><button className="fl" onClick={onLogin}>Log in</button></div>
            <div><h6>Legal</h6><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/cookie-policy">Cookies</a></div>
          </div>
        </div>
      </div>
      <div className="wrap nutri-base"><span>© 2026 Sizzle · made with real home cooks</span><span>NO ADS · NO TRACKING · 13+</span></div>
      </footer>
    </div>
  );
}

const CSS = `
.szl{--bg:#0f0b08;--bg2:#17110c;--accent:#ff5a36;--saffron:#f4a52c;--herb:#9bbd6e;--on:#f6ede2;--soft:#c3b3a6;--faint:#8b7a6c;--line:rgba(255,255,255,.10);--serif:'Fraunces',Georgia,serif;--sans:'Hanken Grotesk',-apple-system,sans-serif;--mono:'Spline Sans Mono',ui-monospace,monospace;background:var(--bg);color:var(--on);font-family:var(--sans);overflow-x:hidden}
.szl .grain{position:fixed;inset:0;z-index:80;pointer-events:none;opacity:.05;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")}
.szl *{margin:0;padding:0;box-sizing:border-box}
.szl a{color:inherit;text-decoration:none}
.szl .linkbtn{background:none;border:none;color:inherit;font-family:inherit;cursor:pointer}
.szl .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.szl .serif{font-family:var(--serif);font-weight:480;line-height:1.0;letter-spacing:-.018em;font-optical-sizing:auto}
.szl .ital{font-style:italic}
.szl .grad{background:linear-gradient(105deg,var(--accent),var(--saffron));-webkit-background-clip:text;background-clip:text;color:transparent}
/* Emphasis: a solid warm word, no clipped-gradient cliché. */
.szl .hot{color:var(--saffron)}
/* Eyebrows + status read like a kitchen order ticket: mono, spaced, an ember tick. */
.szl .eyebrow{font-family:var(--mono);font-size:12px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--saffron)}
.szl .ticket{display:inline-flex;align-items:center;gap:9px;font-family:var(--mono);font-size:12.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}
.szl .ticket .tdot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent)}
.szl .ticket b{color:var(--on);font-weight:600}
/* "Ingredient label" — replaces the generic trust-badge dots. */
.szl .madewith{display:flex;align-items:baseline;flex-wrap:wrap;gap:10px 12px;margin-top:26px;font-family:var(--mono);font-size:12.5px;letter-spacing:.04em;color:var(--faint)}
.szl .madewith .ml{color:var(--saffron);font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.szl .madewith em{font-style:normal;color:var(--herb)}
.szl .btn{display:inline-flex;align-items:center;gap:10px;height:52px;padding:0 22px;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;border:none;transition:transform .15s}
.szl .btn:hover{transform:translateY(-2px)}
.szl .btn-accent{background:linear-gradient(180deg,#ff6a44,#ed4f2c);color:#fff;box-shadow:0 8px 24px rgba(237,79,44,.35)}
.szl .store{display:inline-flex;align-items:center;gap:11px;height:56px;padding:0 22px;border-radius:14px;background:#1b1410;border:1px solid var(--line);color:#fff;cursor:pointer;transition:transform .15s;font-family:inherit;text-align:left}
.szl .store:hover{transform:translateY(-2px)}
.szl .store .ico{font-size:22px;line-height:1}
.szl .store .l1{font-size:10.5px;color:var(--soft)}
.szl .store .l2{font-size:16px;font-weight:700}
.szl .store.on-cream{background:#171008}
.szl .nav{position:sticky;top:0;z-index:40;background:rgba(14,11,9,.72);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.szl .nav .row{display:flex;align-items:center;justify-content:space-between;height:72px}
.szl .brand{font-family:var(--serif);font-size:30px}
.szl .navlinks{display:flex;gap:26px;align-items:center}
.szl .navlinks a,.szl .navlinks .login{font-size:14.5px;color:var(--soft);font-weight:500;transition:color .15s}
.szl .navlinks a:hover,.szl .navlinks .login:hover{color:var(--on)}
.szl .nav .cta{height:42px;padding:0 18px;border-radius:11px}
@media(max-width:820px){.szl .navlinks a:not(.cta){display:none}.szl .navlinks{gap:14px}}
.szl .hero{position:relative;padding:130px 0 90px;overflow:hidden}
.szl .hero::before{content:"";position:absolute;top:-10%;right:-5%;width:680px;height:680px;background:radial-gradient(circle,rgba(255,90,54,.20),transparent 62%);pointer-events:none}
.szl .hero .grid{display:grid;grid-template-columns:1.05fr .95fr;gap:40px;align-items:center;position:relative}
.szl .hero h1{font-size:clamp(56px,8vw,104px);margin:20px 0 0}
.szl .pill{display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 14px;border:1px solid rgba(255,90,54,.4);border-radius:99px;color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.szl .pill .dot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent)}
.szl .hero .sub{margin:26px 0 30px;max-width:480px;font-size:17px;line-height:1.6;color:var(--soft)}
.szl .ctas{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.szl .weblink{display:inline-flex;align-items:center;gap:7px;font-weight:700;font-size:15px;margin-top:18px;color:var(--on)}
.szl .weblink .arr{color:var(--accent);transition:transform .15s}
.szl .weblink:hover .arr{transform:translateX(4px)}
.szl .trust{display:flex;gap:18px;margin-top:22px;font-size:13.5px;color:var(--faint)}
.szl .trust span{display:inline-flex;align-items:center;gap:7px}
.szl .trust .d{width:6px;height:6px;border-radius:50%;background:var(--accent)}
@media(max-width:900px){.szl .hero .grid{grid-template-columns:1fr}.szl .hero{padding:108px 0 50px}}
.szl .cinema{position:relative;height:100vh;width:100%;overflow:hidden;background:#0a0807}
.szl .cinema .cinemavid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.szl .cinema .cinemaveil{position:absolute;inset:0;background:linear-gradient(to top,rgba(10,8,7,.92),rgba(10,8,7,.05) 44%,rgba(10,8,7,.42));pointer-events:none}
.szl .cinema .cinemacap{position:absolute;left:0;right:0;bottom:8%;text-align:center}
.szl .cinema .cinemacap h2{font-size:clamp(32px,5vw,66px);margin:12px 0 0;line-height:1.04}
@media(max-width:900px){.szl .cinema{height:72vh}.szl .cinema .cinemacap{bottom:6%}}
.szl .d3 .d3grid{display:grid;grid-template-columns:1fr 1fr;gap:48px;align-items:center}
.szl .d3 .d3stage{position:relative;height:520px;border-radius:28px;border:1px solid var(--line);background:radial-gradient(120% 120% at 50% 32%,rgba(255,90,54,.14),transparent 62%);overflow:hidden}
.szl .d3 .d3stage model-viewer{--poster-color:transparent;width:100%;height:100%;background:transparent}
.szl .d3 h2{font-size:clamp(40px,5vw,72px);margin:14px 0 0}
.szl .d3 .cta{margin-top:26px}
@media(max-width:900px){.szl .d3 .d3grid{grid-template-columns:1fr;gap:26px}.szl .d3 .d3stage{height:360px}}
.szl .phone-stage{position:relative;justify-self:center}
.szl .phone{position:relative;width:300px;height:632px;border-radius:42px;background:#0a0706;border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 90px rgba(0,0,0,.55),inset 0 0 0 6px #000;overflow:hidden}
.szl .phone .screen{position:absolute;inset:8px;border-radius:34px;overflow:hidden;background:#120c09}
.szl .pstatus{position:absolute;top:0;left:0;right:0;height:34px;display:flex;align-items:center;justify-content:space-between;padding:0 18px;font-size:12px;font-weight:700;color:#fff;z-index:5}
.szl .feedbg{position:absolute;inset:0;background:radial-gradient(120% 80% at 70% 28%,#7a3a1e 0%,#3a1d12 45%,#160d09 100%)}
.szl .feedbg::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(135deg,rgba(255,255,255,.03) 0 2px,transparent 2px 7px)}
.szl .ftabs{position:absolute;top:42px;left:0;right:0;display:flex;gap:18px;justify-content:center;font-size:14px;font-weight:700;color:rgba(255,255,255,.55);z-index:4}
.szl .ftabs .on{color:#fff;position:relative}
.szl .ftabs .on::after{content:"";position:absolute;left:0;right:0;bottom:-7px;height:2px;border-radius:2px;background:var(--accent)}
.szl .play{position:absolute;top:50%;left:50%;width:54px;height:54px;margin:-27px 0 0 -27px;border-radius:50%;background:rgba(0,0,0,.32);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.25);z-index:4}
.szl .rail{position:absolute;right:14px;bottom:118px;display:flex;flex-direction:column;gap:18px;align-items:center;z-index:4}
.szl .rail .av{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--saffron));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;position:relative;border:2px solid #fff}
.szl .rail .av .plus{position:absolute;bottom:-8px;left:50%;transform:translateX(-50%);width:18px;height:18px;border-radius:50%;background:var(--accent);color:#fff;font-size:13px;display:flex;align-items:center;justify-content:center;border:2px solid #160d09}
.szl .rail .act{display:flex;flex-direction:column;align-items:center;gap:3px;color:#fff;font-size:11px;font-weight:700}
.szl .caption{position:absolute;left:16px;right:70px;bottom:74px;z-index:4}
.szl .caption .who{font-size:13.5px;font-weight:700;color:#fff}
.szl .caption .who span{color:rgba(255,255,255,.6);font-weight:500}
.szl .chip{display:inline-block;margin:8px 0 6px;padding:4px 9px;border-radius:7px;background:rgba(255,255,255,.14);font-family:var(--mono);font-size:10px;font-weight:500;letter-spacing:.04em;color:#fff}
.szl .caption .title{font-family:var(--serif);font-size:22px;color:#fff;line-height:1.05}
.szl .viewrec{position:absolute;left:14px;right:14px;bottom:18px;height:44px;border-radius:13px;background:rgba(255,255,255,.95);color:#1a1209;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:13.5px;z-index:4}
.szl .progress{position:absolute;left:16px;right:16px;bottom:66px;height:3px;border-radius:3px;background:rgba(255,255,255,.25);z-index:4}
.szl .progress::after{content:"";position:absolute;left:0;top:0;bottom:0;width:42%;border-radius:3px;background:#fff}
.szl .float{position:absolute;background:rgba(20,14,10,.92);backdrop-filter:blur(8px);border:1px solid var(--line);border-radius:16px;padding:12px 14px;box-shadow:0 20px 50px rgba(0,0,0,.5);z-index:6}
.szl .float.saved{top:54px;left:-46px;display:flex;gap:10px;align-items:center}
.szl .float.saved .mp{width:30px;height:30px;border-radius:8px;background:linear-gradient(135deg,var(--accent),var(--saffron));display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800}
.szl .float.saved .t1{font-size:11px;color:var(--faint);font-weight:600}
.szl .float.saved .t2{font-family:var(--serif);font-size:16px}
.szl .float.saved .t3{font-size:10.5px;color:var(--faint)}
.szl .float.cook{bottom:96px;right:-40px;min-width:150px}
.szl .float.cook .lab{font-size:10px;letter-spacing:.12em;color:var(--faint);font-weight:700}
.szl .float.cook .tm{font-family:var(--serif);font-size:30px;margin-top:2px}
.szl .float.cook .cbar{height:4px;border-radius:4px;background:rgba(255,255,255,.14);margin-top:8px;overflow:hidden}
.szl .float.cook .cbar::after{content:"";display:block;height:100%;width:64%;background:linear-gradient(90deg,var(--accent),var(--saffron))}
@media(max-width:520px){.szl .float.saved{left:-12px}.szl .float.cook{right:-8px}}
.szl .sec{padding:104px 0}
.szl .sec-head{text-align:center;max-width:760px;margin:0 auto}
.szl .sec-head.left{text-align:left;max-width:620px;margin:0}
.szl .sec-head h2{font-size:clamp(34px,5vw,58px);margin-top:14px}
.szl .process .intro{padding:104px 0 40px;text-align:center}
.szl .intro-h{font-size:clamp(34px,5vw,58px);margin-top:14px}
.szl .hint{margin-top:18px;font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.szl .deck{max-width:1060px;margin:0 auto;padding:0 24px}
.szl .step-card{position:relative;border-radius:28px;padding:48px;margin-bottom:34px;overflow:hidden;border:1px solid var(--line)}
.szl .step-card.dark{background:radial-gradient(120% 120% at 88% 0%,#23150d,#140d09);color:var(--on)}
.szl .step-card.cream{background:linear-gradient(180deg,#f7ede2,#efe2d3);color:#2a211b;border-color:rgba(0,0,0,.10)}
.szl .step-inner{display:grid;grid-template-columns:1fr 300px;gap:36px;align-items:center;position:relative;z-index:2}
.szl .step-num{position:absolute;top:24px;right:30px;font-family:var(--mono);font-size:13px;font-weight:500;letter-spacing:.12em;color:var(--saffron);z-index:2}
.szl .step-card.cream .step-num{color:#c2410c}
.szl .step-lab{font-family:var(--mono);font-size:11px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--saffron)}
.szl .step-card h3{font-family:var(--serif);font-size:clamp(30px,4vw,46px);margin:12px 0 16px;line-height:1.02}
.szl .step-card p{font-size:16px;line-height:1.6;max-width:420px}
.szl .step-card.dark p{color:var(--soft)}
.szl .step-card.cream p{color:#6f5e52}
.szl .step-card .phone-stage{transform:scale(.92)}
@media(min-width:901px){
.szl .process.is3d .deck{max-width:none;margin:0;padding:0}
.szl .process.is3d .stage{position:relative;height:100vh;display:grid;place-items:center;perspective:1400px}
.szl .process.is3d .step-card{grid-area:1/1;align-self:center;justify-self:center;width:min(1020px,92vw);max-height:86vh;margin:0;transform-style:preserve-3d;backface-visibility:hidden;will-change:transform,opacity,filter;box-shadow:0 50px 110px rgba(0,0,0,.6)}
}
@media(max-width:900px){.szl .step-inner{grid-template-columns:1fr;gap:24px}.szl .step-card{padding:30px}.szl .step-num{top:18px;right:18px}.szl .step-card .phone-stage{transform:scale(.82);justify-self:center}}
.szl .scr{position:absolute;inset:0;background:#fff;color:#1a1209}
.szl .scr.dark{background:#120c08;color:#f4ece5}
.szl .scr .vid{height:150px;background:radial-gradient(120% 90% at 70% 20%,#7a3a1e,#2c160d)}
.szl .scr .sbody{padding:16px}
.szl .mchip{display:inline-block;background:var(--accent);color:#fff;font-size:10px;font-weight:800;letter-spacing:.05em;padding:4px 9px;border-radius:7px}
.szl .scr h4{font-family:var(--serif);font-size:21px;margin:8px 0 12px}
.szl .meta3{display:flex;gap:8px;margin-bottom:14px}
.szl .meta3 .m{flex:1;border:1px solid rgba(0,0,0,.1);border-radius:10px;padding:7px 8px;text-align:center}
.szl .meta3 .kk{font-size:9.5px;color:#998d83;text-transform:uppercase}
.szl .meta3 .v{font-weight:800;font-size:13px;margin-top:2px}
.szl .ing-h{font-size:12px;font-weight:800;margin-bottom:8px}
.szl .ing{display:flex;align-items:center;gap:8px;font-size:12.5px;padding:8px 10px;border-radius:9px;background:rgba(0,0,0,.04);margin-bottom:6px}
.szl .ing .idot{width:6px;height:6px;border-radius:50%;background:var(--accent)}
.szl .scta{margin-top:6px;height:42px;border-radius:11px;background:#1a1209;color:#fff;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:13px}
.szl .scta.accent{background:var(--accent);margin-top:16px}
.szl .sc-lab{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8b7a6c;font-weight:700;margin-bottom:12px}
.szl .stepper{display:flex;align-items:center;gap:10px;background:rgba(255,255,255,.06);border-radius:14px;padding:8px;margin-bottom:14px}
.szl .scr:not(.dark) .stepper{background:rgba(0,0,0,.05)}
.szl .stepper button{width:44px;height:44px;border-radius:11px;border:none;font-size:22px;font-weight:700;cursor:pointer;background:rgba(255,255,255,.10);color:inherit;font-family:inherit}
.szl .scr:not(.dark) .stepper button{background:rgba(0,0,0,.06)}
.szl .stepper .plus{background:var(--accent);color:#fff}
.szl .stepper .cnt{flex:1;text-align:center}
.szl .stepper .cnt b{font-family:var(--serif);font-size:30px;display:block;line-height:1}
.szl .stepper .cnt span{font-size:10px;color:#9a8e84}
.szl .scr-row{display:flex;justify-content:space-between;font-size:13px;padding:11px 4px;border-bottom:1px solid rgba(255,255,255,.08)}
.szl .scr:not(.dark) .scr-row{border-color:rgba(0,0,0,.06)}
.szl .scr-row b{color:var(--accent)}
.szl .cook-scr{position:absolute;inset:0;background:#120c08;color:#f4ece5;padding:18px}
.szl .cook-scr .cl{font-size:10px;letter-spacing:.12em;color:#8b7a6c;font-weight:700}
.szl .cook-scr .ins{font-family:var(--serif);font-size:21px;line-height:1.2;margin:10px 0 18px}
.szl .ring{width:150px;height:150px;border-radius:50%;margin:6px auto 14px;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-size:34px;background:conic-gradient(var(--accent) 0 62%,rgba(255,255,255,.12) 62% 100%);position:relative}
.szl .ring::before{content:"";position:absolute;inset:12px;border-radius:50%;background:#120c08}
.szl .ring span{position:relative;z-index:2}
.szl .cook-scr .note{text-align:center;font-size:11px;color:#8b7a6c;margin-bottom:14px}
.szl .cook-btns{display:flex;gap:10px}
.szl .cook-btns .cb{flex:1;height:42px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px}
.szl .cook-btns .back{background:rgba(255,255,255,.08)}
.szl .cook-btns .next{background:var(--accent);color:#fff}
.szl .feat-try{margin-top:48px;border-radius:24px;border:1px solid var(--line);background:radial-gradient(120% 130% at 85% 0%,#23150d,#140d09);padding:38px;display:grid;grid-template-columns:1fr 1fr;gap:34px;align-items:center}
.szl .feat-try h3{font-family:var(--serif);font-size:32px;margin:10px 0 12px}
.szl .feat-try p{color:var(--soft);font-size:15px;line-height:1.6;margin-bottom:22px}
.szl .stepper.try{max-width:280px;background:rgba(255,255,255,.05)}
.szl .try-panel{background:rgba(0,0,0,.25);border:1px solid var(--line);border-radius:16px;padding:14px}
.szl .try-panel .scr-row{border-color:rgba(255,255,255,.08);color:var(--on)}
.szl .try-panel .scr-row.muted{border:none;color:var(--faint)}
@media(max-width:760px){.szl .feat-try{grid-template-columns:1fr;padding:26px}}
.szl .fgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-top:26px}
.szl .fcard{background:var(--bg2);border:1px solid var(--line);border-radius:18px;padding:24px}
.szl .fcard .fi{width:42px;height:42px;border-radius:12px;background:rgba(255,90,54,.14);display:flex;align-items:center;justify-content:center;color:var(--accent);margin-bottom:16px;font-size:20px}
.szl .fcard h4{font-size:17px;font-weight:700;margin-bottom:8px}
.szl .fcard p{font-size:14px;line-height:1.55;color:var(--soft)}
@media(max-width:860px){.szl .fgrid{grid-template-columns:1fr 1fr}}
@media(max-width:560px){.szl .fgrid{grid-template-columns:1fr}}
.szl .creators{position:relative}
.szl .creators::before{content:"";position:absolute;top:0;right:0;width:560px;height:560px;background:radial-gradient(circle,rgba(244,165,44,.14),transparent 60%);pointer-events:none}
.szl .creators .lead{max-width:540px;position:relative}
.szl .creators h2{font-size:clamp(32px,4.6vw,52px);margin:14px 0 16px}
.szl .creators .lead p{color:var(--soft);font-size:17px;line-height:1.6}
.szl .roadmap-lab{margin:46px 0 16px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--faint);font-weight:700;position:relative}
.szl .road{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;position:relative}
.szl .rcard{background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:20px}
.szl .rcard .rn{font-family:var(--serif);font-size:26px;color:var(--accent)}
.szl .rcard h5{font-size:15px;font-weight:700;margin:8px 0 5px}
.szl .rcard p{font-size:13px;color:var(--faint);line-height:1.5}
.szl .rcard.last{grid-column:1/-1;background:linear-gradient(100deg,rgba(255,90,54,.14),rgba(244,165,44,.07));border:1px solid rgba(255,90,54,.4)}
@media(max-width:860px){.szl .road{grid-template-columns:1fr 1fr}}
@media(max-width:480px){.szl .road{grid-template-columns:1fr}}
.szl .trust-sec{text-align:center;padding:114px 0}
.szl .trust-sec h2{font-size:clamp(36px,5.4vw,64px)}
.szl .trust-sec p{max-width:540px;margin:22px auto 0;color:var(--soft);font-size:17px;line-height:1.6}
.szl .trust-links{margin-top:24px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap;font-size:14.5px}
.szl .trust-links a{color:var(--soft);text-decoration:underline;text-underline-offset:3px}
.szl .trust-links a:hover{color:#fff}
.szl .trust-links .sep{color:var(--faint)}
.szl .cta-sec{padding:0 0 104px}
.szl .cta-card{position:relative;overflow:hidden;border-radius:30px;background:linear-gradient(150deg,#ff6b40,#e8481f 60%,#d63f17);padding:74px 24px;text-align:center;box-shadow:0 40px 100px rgba(214,63,23,.35)}
.szl .cta-card::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(135deg,rgba(255,255,255,.06) 0 2px,transparent 2px 9px);pointer-events:none}
.szl .cta-card .b{font-size:26px;color:rgba(255,255,255,.9);position:relative}
.szl .cta-card h2{font-size:clamp(38px,6vw,68px);color:#fff;margin:6px 0 0;position:relative}
.szl .cta-card p{color:rgba(255,255,255,.92);font-size:17px;margin:18px auto 30px;max-width:420px;position:relative}
.szl .cta-card .ctas{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;position:relative}
.szl .cta-card .weblink{justify-content:center;color:#fff;width:100%}
.szl .cta-card .weblink .arr{color:#fff}
.szl .foot-wrap{border-top:1px solid var(--line);padding:58px 0 36px}
.szl .foot{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:34px}
.szl .foot .brand{font-size:34px}
.szl .foot .tag{margin:12px 0 0;color:var(--soft);font-size:14.5px;line-height:1.6;max-width:300px}
.szl .fcol h6{font-size:13px;font-weight:700;color:var(--faint);text-transform:uppercase;letter-spacing:.1em;margin-bottom:14px}
.szl .fcol a,.szl .fcol .fl{display:block;font-size:14.5px;color:var(--soft);margin-bottom:11px;text-align:left}
.szl .fcol a:hover,.szl .fcol .fl:hover{color:#fff}
.szl .foot-base{margin-top:38px;padding-top:22px;border-top:1px solid var(--line);display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-size:13px;color:var(--faint)}
@media(max-width:760px){.szl .foot{grid-template-columns:1fr 1fr}.szl .foot .brand-col{grid-column:1/-1}}

/* The Menu — FAQ accordion */
.szl .menu-sec{padding:30px 0 100px}
.szl .menu-sec .eyebrow{display:block;text-align:center}
.szl .menu-sec h2{text-align:center;font-size:clamp(36px,5.4vw,62px);margin:12px 0 38px}
.szl .menu-list{max-width:780px;margin:0 auto;border-top:1px solid var(--line)}
.szl .faq{border-bottom:1px solid var(--line)}
.szl .faq button{display:flex;width:100%;align-items:center;justify-content:space-between;gap:20px;background:none;border:none;cursor:pointer;padding:24px 4px;text-align:left;color:var(--on);font-family:inherit}
.szl .faq .q{font-family:var(--serif);font-weight:480;font-size:clamp(20px,2.6vw,27px);line-height:1.08}
.szl .faq .pm{flex:none;width:30px;height:30px;border-radius:50%;border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--saffron);font-size:19px;line-height:1;transition:transform .3s}
.szl .faq.open .pm{transform:rotate(45deg);border-color:var(--saffron)}
.szl .faq .a{max-height:0;overflow:hidden;transition:max-height .45s cubic-bezier(.16,1,.3,1)}
.szl .faq.open .a{max-height:220px}
.szl .faq .a p{color:var(--soft);font-size:16px;line-height:1.6;padding:0 4px 26px;max-width:640px}

/* Footer — Nutrition Facts label */
.szl .nutri-foot{border-top:1px solid var(--line);padding:72px 0 40px}
.szl .nutri-foot .nwrap{display:grid;grid-template-columns:330px 1fr;gap:56px;align-items:start}
.szl .nutri-label{background:#f6ede0;color:#15100c;border:2px solid #15100c;border-radius:5px;padding:13px 15px;box-shadow:0 26px 64px -22px rgba(0,0,0,.65)}
.szl .nutri-label .nl-title{font-family:var(--serif);font-weight:700;font-size:35px;line-height:.92;letter-spacing:-.015em;border-bottom:9px solid #15100c;padding-bottom:3px;color:#15100c}
.szl .nl-sub{font-family:var(--mono);font-size:11px;padding:5px 0;border-bottom:1px solid #15100c}
.szl .nl-amt{font-family:var(--mono);font-size:10.5px;font-weight:600;padding:6px 0 1px}
.szl .nl-cal{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--serif);font-weight:700;font-size:25px;border-bottom:5px solid #15100c;padding-bottom:3px}
.szl .nl-dv{text-align:right;font-family:var(--mono);font-size:10px;font-weight:700;padding:4px 0;border-bottom:1px solid #15100c}
.szl .nl-row{display:flex;justify-content:space-between;align-items:baseline;font-family:var(--mono);font-size:12.5px;padding:5px 0;border-bottom:1px solid rgba(21,16,12,.3)}
.szl .nl-row b{font-weight:700}
.szl .nl-row.sub{padding-left:14px;color:#6a5b4e;font-size:11.5px}
.szl .nl-row.thickb{border-bottom:6px solid #15100c}
.szl .nl-note{font-family:var(--mono);font-size:9.5px;line-height:1.4;padding-top:8px;color:#6a5b4e}
.szl .nutri-links .brand{font-size:36px;color:var(--on)}
.szl .nutri-links .tag{margin:10px 0 24px;color:var(--soft);font-size:14.5px;line-height:1.6;max-width:380px}
.szl .nutri-cols{display:flex;gap:50px;flex-wrap:wrap}
.szl .nutri-cols h6{font-family:var(--mono);font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--saffron);margin-bottom:13px}
.szl .nutri-cols a,.szl .nutri-cols .fl{display:block;color:var(--soft);font-size:14.5px;margin-bottom:9px;background:none;border:none;padding:0;cursor:pointer;font-family:inherit;text-align:left;transition:color .15s}
.szl .nutri-cols a:hover,.szl .nutri-cols .fl:hover{color:var(--on)}
.szl .nutri-base{margin-top:48px;padding-top:22px;border-top:1px solid var(--line);display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;font-family:var(--mono);font-size:12px;letter-spacing:.04em;color:var(--faint)}
@media(max-width:760px){.szl .nutri-foot .nwrap{grid-template-columns:1fr;gap:36px}.szl .nutri-label{max-width:360px}}

/* Manifesto + stats band */
.szl .manifesto{padding:70px 0 40px;text-align:center}
.szl .manifesto h2{font-size:clamp(30px,4.6vw,54px);max-width:920px;margin:14px auto 0;line-height:1.1}
.szl .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:24px;max-width:920px;margin:56px auto 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:40px 0}
.szl .stat .n{font-family:var(--serif);font-weight:480;font-size:clamp(40px,5vw,62px);color:var(--on);line-height:1}
.szl .stat .n span{font-family:var(--mono);font-size:18px;font-weight:500;color:var(--saffron);margin-left:2px}
.szl .stat .l{font-family:var(--mono);font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);margin-top:11px}
@media(max-width:760px){.szl .stats{grid-template-columns:1fr 1fr;gap:32px 20px}}
`;
