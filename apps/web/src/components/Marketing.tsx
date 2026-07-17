import { useEffect, useRef, useState } from 'react';
import { Button } from './controls';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';
import Lenis from 'lenis';

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** "The Menu" — playful FAQ accordion (cerealbnb-style, Sizzle voice). */
const FAQS = [
  { q: 'Is Sizzle actually free?', a: 'Completely. No ads, no subscription, no catch. We make money later — never off your data.' },
  { q: 'Do recipes really scale themselves?', a: 'Tap your serving count and every ingredient redoes the math on the spot. Cooking for 2 or for 12, the amounts are always right.' },
  { q: 'No ads — for real?', a: 'For real. Your feed feeds you, not advertisers. Zero ads, zero third-party tracking, ever.' },
  { q: 'Can I post my own recipes?', a: 'Record a clip, drop in the recipe, hit post. Creators keep their videos, their followers, and all the credit.' },
  { q: 'Where are the ten-paragraph life stories?', a: 'Nowhere to be found. You came for the recipe, so you get the recipe — clean, scaled, and ready for the stove.' },
];

/** "See it in action" — the four real app screens the demo phone cycles through. */
const DEMO_STEPS = [
  { lab: 'The feed', t: 'Swipe a feed that learns your taste.' },
  { lab: 'The recipe', t: 'One tap to a clean, structured recipe.' },
  { lab: 'The scaler', t: 'Scale every amount to your table.' },
  { lab: 'Cook Mode', t: 'Cook along hands-free, with timers.' },
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
  const demoRef = useRef<HTMLElement>(null);
  const lenisRef = useRef<Lenis | null>(null);
  const [servings, setServings] = useState(2);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [demoStep, setDemoStep] = useState(0);

  // Scrollytelling film chapters — desktop + motion only; useGSAP auto-cleans up.
  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const canScrub = window.matchMedia('(min-width: 760px)').matches;

      // ── SCROLLYTELLING STORY ─────────────────────────────────────────────
      // The food footage is a pinned backdrop the scroll flies through; the
      // story's text "scenes" crossfade in/out over it as the playhead scrubs,
      // so the whole opening reads as one continuous film. Tablet+/laptop only;
      // true-mobile keeps the autoplay-loop fallback (CSS stacks the scenes).
      const smooth = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
      // Wire one pinned "film chapter": its background clip scrubs with scroll
      // progress while its text scenes crossfade in/out over it. Called for
      // every `.story-stage` so the whole page reads as one continuous film.
      const buildFilm = (stage: HTMLElement) => {
        const vid = stage.querySelector<HTMLVideoElement>('.story-bg');
        const scenes = gsap.utils.toArray<HTMLElement>('.scene', stage);
        if (!vid || !scenes.length) return;
        stage.classList.add('is-scrub');
        vid.pause();
        vid.removeAttribute('loop');
        vid.removeAttribute('autoplay');
        const N = scenes.length;
        const cue = stage.querySelector<HTMLElement>('.scrollcue');
        const seek = (p: number) => {
          const d = vid.duration || 20;
          vid.currentTime = Math.max(0, Math.min(d - 0.05, p * d));
        };
        gsap.set(scenes, { opacity: 0 });
        gsap.set(scenes[0]!, { opacity: 1 });
        // Each scene "lives" at an evenly-spaced point along the scroll (0…1):
        // full while near its centre, crossfading to the next. Scene 0 is full
        // at the chapter's top; the last scene at its bottom.
        const span = N > 1 ? 1 / (N - 1) : 1;
        ScrollTrigger.create({
          trigger: stage,
          start: 'top top',
          // One screen-height of scroll per scene → comfortable, filmic pace.
          // Function-based so it re-measures on refresh (resize/orientation).
          end: () => '+=' + window.innerHeight * N,
          pin: true,
          // Tight scrub — the all-intra clip seeks every frame instantly, so we
          // don't need much lerp (which itself reads as lag).
          scrub: 0.4,
          refreshPriority: 2,
          // Recompute the pinned stage's locked width on every refresh so it
          // always fills the viewport (otherwise a wider window leaves a gap).
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const p = self.progress;
            seek(p);
            scenes.forEach((el, i) => {
              const d = Math.abs(p - i * span);
              const hold = span * 0.3;
              const fade = span * 0.22;
              const o = smooth(d <= hold ? 1 : d >= hold + fade ? 0 : 1 - (d - hold) / fade);
              el.style.opacity = String(o);
              el.style.transform = `translate3d(0, ${(1 - o) * 26}px, 0)`;
              el.style.pointerEvents = o > 0.55 ? 'auto' : 'none';
            });
            if (cue) cue.style.opacity = String(Math.max(0, 1 - p * N * 2.4));
          },
        });
        vid.addEventListener('loadedmetadata', () => ScrollTrigger.refresh(), { once: true });
      };
      if (canScrub) {
        root.current!.querySelectorAll<HTMLElement>('.story-stage').forEach(buildFilm);
      }
    },
    { scope: root },
  );

  // Lenis smooth scrolling — the "buttery" momentum that makes the scene
  // transitions feel like one continuous film. Driven by GSAP's ticker so it
  // stays in lock-step with ScrollTrigger. Skipped for reduced-motion.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true });
    lenisRef.current = lenis;
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    // Pinned sections lock a fixed pixel width when GSAP builds them; if the
    // window later resizes (or finishes loading wider than the first measure),
    // that lock goes stale and the pinned film stage stays stuck narrow,
    // leaving a blank gutter on the right. Re-measure on resize to refit it.
    let rid: number | undefined;
    const onResize = () => {
      window.clearTimeout(rid);
      rid = window.setTimeout(() => ScrollTrigger.refresh(), 150);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    // One settle pass once fonts/video metadata have laid out.
    const settle = window.setTimeout(() => ScrollTrigger.refresh(), 320);

    return () => {
      window.clearTimeout(rid);
      window.clearTimeout(settle);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      gsap.ticker.remove(tick);
      gsap.ticker.lagSmoothing(500, 33);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Custom scrollbar — the native one is hidden (overlay on macOS), so draw an
  // always-visible bar on the right that tracks scroll position and can be
  // dragged to scroll (drives Lenis when present).
  useEffect(() => {
    const bar = root.current?.querySelector<HTMLElement>('.szl-scroll');
    const thumb = root.current?.querySelector<HTMLElement>('.szl-scroll-thumb');
    if (!bar || !thumb) return;
    const metrics = () => {
      const docH = document.documentElement.scrollHeight;
      const winH = window.innerHeight;
      const maxScroll = Math.max(0, docH - winH);
      const thumbH = Math.max(44, (winH / docH) * winH);
      return { maxScroll, trackH: winH, thumbH };
    };
    const update = () => {
      const { maxScroll, trackH, thumbH } = metrics();
      // Inline opacity (not a toggled class) so React re-renders can't clobber it.
      bar.style.opacity = maxScroll < 8 ? '0' : '1';
      if (maxScroll < 8) return;
      const y = (window.scrollY / maxScroll) * (trackH - thumbH);
      thumb.style.height = thumbH + 'px';
      thumb.style.transform = `translateY(${y}px)`;
    };
    let dragging = false;
    let startY = 0;
    let startScroll = 0;
    const onDown = (e: MouseEvent) => {
      dragging = true;
      startY = e.clientY;
      startScroll = window.scrollY;
      thumb.classList.add('dragging');
      document.body.style.userSelect = 'none';
      e.preventDefault();
    };
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      const { maxScroll, trackH, thumbH } = metrics();
      const denom = trackH - thumbH;
      const target = Math.max(0, Math.min(maxScroll, startScroll + (denom > 0 ? ((e.clientY - startY) / denom) * maxScroll : 0)));
      if (lenisRef.current) lenisRef.current.scrollTo(target, { immediate: true });
      else window.scrollTo(0, target);
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      thumb.classList.remove('dragging');
      document.body.style.userSelect = '';
    };
    thumb.addEventListener('mousedown', onDown);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    const settle = window.setTimeout(update, 400);
    update();
    return () => {
      thumb.removeEventListener('mousedown', onDown);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.clearTimeout(settle);
    };
  }, []);

  // "See it in action" demo phone — auto-advances through the four app screens,
  // but only while the section is on screen (and never for reduced-motion, where
  // the step chips stay clickable instead).
  useEffect(() => {
    const node = demoRef.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let timer: number | undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          if (timer === undefined) timer = window.setInterval(() => setDemoStep((s) => (s + 1) % DEMO_STEPS.length), 2600);
        } else if (timer !== undefined) {
          window.clearInterval(timer);
          timer = undefined;
        }
      },
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, []);

  // Decorative (non-scrubbed) landing videos only play while on screen — so they
  // don't eagerly download or keep a decoder running off-screen all session.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Also pause the story-bg hero films when off-screen. On desktop these are
    // scroll-SCRUBBED (buildFilm removes autoplay/loop and marks the stage
    // .is-scrub) — the callback skips those so it never fights the scrub. On
    // mobile they keep the autoplay-loop fallback, and without this all three
    // decoded/looped at once off-screen (battery/data/heat on the landing page).
    const vids = Array.from(root.current?.querySelectorAll<HTMLVideoElement>('.feat-film, .trust-film, .story-bg') ?? []);
    if (!vids.length || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const v = e.target as HTMLVideoElement;
          if (v.closest('.is-scrub')) continue; // scroll-scrubbed hero film — leave its currentTime alone
          if (e.isIntersecting) void v.play().catch(() => {});
          else v.pause();
        }
      },
      { threshold: 0.15 },
    );
    vids.forEach((v) => io.observe(v));
    return () => io.disconnect();
  }, []);

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
      <div className="szl-scroll" aria-hidden="true"><div className="szl-scroll-thumb" /></div>

      {/* NAV */}
      <nav className="nav">
        <div className="wrap row">
          <Button className="brand linkbtn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
            <img src="/brand/sizzle-mark-flat.svg" alt="" width={28} height={35} style={{ display: 'block' }} />
            Sizzle
          </Button>
          <div className="navlinks">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#creators">Creators</a>
            <a href="/privacy">Privacy</a>
            <Button className="linkbtn login" onClick={onLogin}>Log in</Button>
            <Button className="btn btn-accent cta" onClick={app}>Get early access</Button>
          </div>
        </div>
      </nav>

      {/* ── SCROLLYTELLING STORY ───────────────────────────────────────────
          The "feed to plate" footage is a fixed backdrop the scroll flies
          through; Sizzle's story crossfades over it scene by scene, so the
          whole opening reads as one continuous film. */}
      <section className="story" id="top" aria-label="From feed to plate">
        <div className="story-stage">
          <video
            className="story-bg"
            poster="/landing/feed-to-plate-3d-poster.jpg"
            muted
            playsInline
            autoPlay
            loop
            preload="auto"
          >
            <source media="(max-width:759px)" src="/landing/feed-to-plate-3d-mobile.mp4" />
            <source src="/landing/feed-to-plate-3d.mp4" />
          </video>
          <div className="story-veil" />

          <div className="scene" data-scene="0">
            <div className="wrap">
              <span className="ticket"><span className="tdot" /> Live feed — <b>12,408 recipes</b> · 0 ads</span>
              <h1 className="serif">Watch it.<br />Then <span className="hot ital">actually</span> cook it.</h1>
              <p className="sub">Full-screen video recipes from real home cooks — the good part of cooking: the watching, the wanting, the making.</p>
            </div>
          </div>

          <div className="scene" data-scene="1">
            <div className="wrap">
              <span className="eyebrow">One tap</span>
              <h2 className="serif">Every clip is a<br /><span className="hot ital">real recipe.</span></h2>
              <p className="sub">Tap once and the video unfolds into a clean, structured recipe — ingredients, quantities, numbered steps. No ten-paragraph life story to scroll past.</p>
            </div>
          </div>

          <div className="scene" data-scene="2">
            <div className="wrap">
              <span className="eyebrow">Serving scaler</span>
              <h2 className="serif">Scaled to<br /><span className="hot ital">your</span> table.</h2>
              <p className="sub">Cooking for two or for twelve? Set the servings and every amount redoes the math on the spot. No half-eggs, no mental arithmetic.</p>
            </div>
          </div>

          <div className="scene" data-scene="3">
            <div className="wrap">
              <span className="eyebrow">Made with</span>
              <h2 className="serif">No ads. No tracking.<br /><span className="hot ital">Just food.</span></h2>
              <p className="sub">Your feed feeds you — not advertisers. Real home cooks, zero ads, no third-party tracking. Ever.</p>
            </div>
          </div>

          <div className="scene scene-cta" data-scene="4">
            <div className="wrap center">
              <span className="eyebrow">Hungry yet?</span>
              <h2 className="serif">Come get <span className="hot ital">hungry.</span></h2>
              <div className="ctas">
                <Button className="btn btn-accent" onClick={app}>Get early access</Button>
              </div>
              <Button className="weblink linkbtn" onClick={app}>Or open the web app <span className="arr">→</span></Button>
            </div>
          </div>

          <div className="scrollcue" aria-hidden="true"><span>Scroll</span><i /></div>
        </div>
      </section>

      {/* ── HOW IT WORKS — film chapter ──────────────────────────────────
          Replaces the old flat 3D card deck: the prep/cook footage scrubs as a
          fixed backdrop while the four steps crossfade over it, same engine as
          the hero so the page keeps reading as one continuous film. */}
      <section className="story film-how" id="how" aria-label="How it works">
        <div className="story-stage">
          <video
            className="story-bg"
            poster="/landing/how-it-works-3d-poster.jpg"
            muted
            playsInline
            autoPlay
            loop
            preload="auto"
          >
            <source media="(max-width:759px)" src="/landing/how-it-works-3d-mobile.mp4" />
            <source src="/landing/how-it-works-3d.mp4" />
          </video>
          <div className="story-veil" />

          <div className="scene" data-scene="0">
            <div className="wrap">
              <span className="eyebrow">01 · The crave</span>
              <h2 className="serif">Discover<br />the <span className="hot ital">dish.</span></h2>
              <p className="sub">Swipe a full-screen feed tuned to your taste — a personalized For You and a Following feed of real home cooks. No blogs, no clutter, just the next thing you want to make.</p>
            </div>
          </div>

          <div className="scene" data-scene="1">
            <div className="wrap">
              <span className="eyebrow">02 · The tap</span>
              <h2 className="serif">One tap to<br />the <span className="hot ital">recipe.</span></h2>
              <p className="sub">Any video unfolds into a clean, structured recipe — ingredients with quantities, numbered steps, cuisine, time and difficulty. The whole thing, none of the life story.</p>
            </div>
          </div>

          <div className="scene" data-scene="2">
            <div className="wrap">
              <span className="eyebrow">03 · The math</span>
              <h2 className="serif">Scale it to<br /><span className="hot ital">any table.</span></h2>
              <p className="sub">Set how many you're feeding and every quantity recalculates on the spot. Push the whole list — already scaled — straight to your shopping list.</p>
            </div>
          </div>

          <div className="scene" data-scene="3">
            <div className="wrap">
              <span className="eyebrow">04 · The cook</span>
              <h2 className="serif">Then <span className="hot ital">actually</span><br />cook it.</h2>
              <p className="sub">A big step-by-step Cook Mode with built-in timers that keeps your screen awake — so you can cook along hands-free, from first sear to the plate.</p>
            </div>
          </div>

          <div className="scrollcue" aria-hidden="true"><span>Keep scrolling</span><i /></div>
        </div>
      </section>


      {/* MANIFESTO + STATS */}
      {/* FEATURES — interactive, over a dimmed food-film backdrop (not flat). */}
      <section className="sec feat-sec" id="features">
        <video className="feat-film" poster="/landing/how-it-works-3d-poster.jpg" muted playsInline loop preload="none" aria-hidden="true">
          <source media="(max-width:759px)" src="/landing/how-it-works-3d-mobile.mp4" />
          <source src="/landing/how-it-works-3d.mp4" />
        </video>
        <div className="feat-film-veil" />
        <div className="wrap">
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
              <Button onClick={() => setServings((n) => Math.max(1, n - 1))}>−</Button>
              <div className="cnt"><b>{servings}</b><span>servings</span></div>
              <Button className="plus" onClick={() => setServings((n) => Math.min(20, n + 1))}>+</Button>
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

      {/* ── FOR CREATORS — film chapter ───────────────────────────────────
          The plating footage scrubs behind the creator pitch + roadmap, so the
          section reads as one more reel of the film instead of a flat card grid. */}
      <section className="story film-creators" id="creators" aria-label="For creators">
        <div className="story-stage">
          <video
            className="story-bg"
            poster="/landing/creators-3d-poster.jpg"
            muted
            playsInline
            autoPlay
            loop
            preload="auto"
          >
            <source media="(max-width:759px)" src="/landing/creators-3d-mobile.mp4" />
            <source src="/landing/creators-3d.mp4" />
          </video>
          <div className="story-veil" />

          <div className="scene" data-scene="0">
            <div className="wrap">
              <span className="eyebrow">For creators</span>
              <h2 className="serif">Share your food.<br /><span className="hot ital">Grow your following.</span></h2>
              <p className="sub">Record in-app or upload from your library, publish recipes or honest reviews, and build an audience around the food you love. Your videos, your followers, all the credit.</p>
            </div>
          </div>

          <div className="scene" data-scene="1">
            <div className="wrap">
              <span className="eyebrow">The roadmap · 5 phases</span>
              <h2 className="serif">From first post<br />to <span className="hot ital">getting paid.</span></h2>
              <div className="roadline">
                <div className="rl"><span className="rln">01</span><b>Watch &amp; cook</b><span>Feed, recipes &amp; Cook Mode</span></div>
                <div className="rl"><span className="rln">02</span><b>Create &amp; grow</b><span>Posting, profiles, following</span></div>
                <div className="rl"><span className="rln">03</span><b>Organize</b><span>Collections &amp; shopping list</span></div>
                <div className="rl"><span className="rln">04</span><b>Community</b><span>Reviews, reposts, verification</span></div>
                <div className="rl hot-step"><span className="rln">05</span><b>Monetize</b><span>Earn from the food you share</span></div>
              </div>
            </div>
          </div>

          <div className="scrollcue" aria-hidden="true"><span>Keep scrolling</span><i /></div>
        </div>
      </section>

      {/* TRUST — a film "title card": the statement over the sizzling-pan footage. */}
      <section className="trust-sec">
        <video className="trust-film" poster="/landing/feed-to-plate-3d-poster.jpg" muted playsInline loop preload="none" aria-hidden="true">
          <source media="(max-width:759px)" src="/landing/feed-to-plate-3d-mobile.mp4" />
          <source src="/landing/feed-to-plate-3d.mp4" />
        </video>
        <div className="trust-film-veil" />
        <div className="wrap">
          <h2 className="serif">No ads. No tracking.<br /><span className="hot ital">Just good food.</span></h2>
          <p>Privacy-first by design — no third-party tracking, ever. Built for everyone 13 and up.</p>
          <div className="trust-links"><a href="/privacy">Privacy Policy</a><span className="sep">·</span><a href="/terms">Terms of Service</a><span className="sep">·</span><a href="/cookie-policy">Cookie Policy</a></div>
        </div>
      </section>

      {/* THE MENU — FAQ accordion */}
      <section className="menu-sec" id="menu"><div className="wrap">
        <span className="eyebrow">The menu</span>
        <h2 className="serif">Questions, <span className="hot ital">answered.</span></h2>
        <div className="menu-list">
          {FAQS.map((f, i) => (
            <div key={i} className={'faq' + (openFaq === i ? ' open' : '')}>
              <Button onClick={() => setOpenFaq(openFaq === i ? null : i)} aria-expanded={openFaq === i}>
                <span className="q">{f.q}</span>
                <span className="pm">+</span>
              </Button>
              <div className="a"><p>{f.a}</p></div>
            </div>
          ))}
        </div>
      </div></section>

      {/* ── SEE IT IN ACTION — auto-cycling app demo ─────────────────────
          The real app screens resurrected as one looping phone, so visitors
          see exactly how Sizzle works right before the call to action. */}
      <section className="sec demo-sec" id="demo" ref={demoRef}><div className="wrap">
        <div className="demo-grid">
          <div className="demo-copy">
            <span className="eyebrow">See it in action</span>
            <h2 className="serif">The whole flow,<br /><span className="hot ital">in your hand.</span></h2>
            <p>Feed to recipe to dinner — here's exactly how Sizzle works, start to plate.</p>
            <div className="demo-steps">
              {DEMO_STEPS.map((s, i) => (
                <Button key={i} className={'demo-step' + (demoStep === i ? ' on' : '')} onClick={() => setDemoStep(i)} aria-pressed={demoStep === i}>
                  <span className="ds-n">{String(i + 1).padStart(2, '0')}</span>
                  <span className="ds-txt"><b>{s.lab}</b><span>{s.t}</span></span>
                </Button>
              ))}
            </div>
          </div>

          <div className="demo-phone-wrap">
            <div className="phone demo-phone">
              <div className="screen">
                {/* 0 — Feed */}
                <div className={'demo-screen' + (demoStep === 0 ? ' on' : '')} aria-hidden={demoStep !== 0}>
                  <div className="feedbg" />
                  <div className="ftabs" style={{ top: 18 }}><span>Following</span><span className="on">For You</span></div>
                  <div className="play"><svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg></div>
                  <div className="rail" style={{ bottom: 96 }}>
                    <div className="av">MP<span className="plus">+</span></div>
                    <div className="act"><svg width="24" height="24" viewBox="0 0 24 24" fill="#ff5a36"><path d="M12 21s-7-4.35-9.5-8.5C.8 9.4 2.3 6 5.5 6c2 0 3.2 1.2 3.9 2.3C10 7.2 11.2 6 13.2 6c3.2 0 4.7 3.4 3 6.5C19 16.65 12 21 12 21z" /></svg>48.2k</div>
                    <div className="act"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-4.5A8.4 8.4 0 1 1 21 11.5z" /></svg>612</div>
                  </div>
                  <div className="caption" style={{ bottom: 30 }}><div className="who">Mina Park <span>@minapark</span></div><span className="chip">JAPANESE · 25 MIN</span><div className="title">Charred Miso<br />Eggplant</div></div>
                </div>

                {/* 1 — Recipe */}
                <div className={'demo-screen' + (demoStep === 1 ? ' on' : '')} aria-hidden={demoStep !== 1}>
                  <div className="scr">
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
                  </div>
                </div>

                {/* 2 — Serving scaler */}
                <div className={'demo-screen' + (demoStep === 2 ? ' on' : '')} aria-hidden={demoStep !== 2}>
                  <div className="scr dark">
                    <div className="sbody">
                      <div className="sc-lab">Serving scaler</div>
                      <div className="stepper"><Button>−</Button><div className="cnt"><b>6</b><span>servings</span></div><Button className="plus">+</Button></div>
                      <div className="scr-row"><span>Globe eggplants</span><b>3</b></div>
                      <div className="scr-row"><span>White miso</span><b>4½ tbsp</b></div>
                      <div className="scr-row"><span>Mirin</span><b>1½ tbsp</b></div>
                      <div className="scr-row"><span>Toasted sesame</span><b>3 tsp</b></div>
                      <div className="scta accent">🛒 Add to shopping list</div>
                    </div>
                  </div>
                </div>

                {/* 3 — Cook Mode */}
                <div className={'demo-screen' + (demoStep === 3 ? ' on' : '')} aria-hidden={demoStep !== 3}>
                  <div className="cook-scr">
                    <div className="cl">COOK MODE · STEP 4 OF 5</div>
                    <div className="ins">Flip, brush generously with glaze, and broil until lacquered.</div>
                    <div className="ring"><span>3:00</span></div>
                    <div className="note">Built-in timer · screen stays awake</div>
                    <div className="cook-btns"><div className="cb back">Back</div><div className="cb next">Next step</div></div>
                  </div>
                </div>
              </div>
            </div>
            <div className="demo-dots" role="tablist" aria-label="App demo steps">
              {DEMO_STEPS.map((_, i) => (
                <Button key={i} className={demoStep === i ? 'on' : ''} onClick={() => setDemoStep(i)} aria-label={'Step ' + (i + 1)} />
              ))}
            </div>
          </div>
        </div>
      </div></section>

      {/* FINAL CTA */}
      <section className="cta-sec"><div className="wrap"><div className="cta-card">
        <div className="b serif">Sizzle</div>
        <h2 className="serif">Recipes you can actually make.</h2>
        <p>Watch it. Scale it. Cook it. Free on the web — iOS and Android are on the way.</p>
        <div className="ctas">
          <Button className="btn btn-dark" onClick={app}>Get early access</Button>
        </div>
        <Button className="weblink linkbtn" onClick={app}>Or open the web app <span className="arr">→</span></Button>
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
            <div><h6>Product</h6><a href="#how">How it works</a><a href="#features">Features</a><a href="#creators">For creators</a><Button className="fl" onClick={app}>Get early access</Button></div>
            <div><h6>The menu</h6><a href="#menu">FAQ</a><a href="/contact">Contact</a><Button className="fl" onClick={onLogin}>Log in</Button></div>
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
/* Lenis smooth scroll (unscoped — only present while the landing is mounted). */
html.lenis,html.lenis body{height:auto}
.lenis.lenis-smooth{scroll-behavior:auto!important}
.lenis.lenis-smooth [data-lenis-prevent]{overscroll-behavior:contain}
.lenis.lenis-stopped{overflow:hidden}
/* The landing hides the native (overlay) scrollbar and draws its own always-
   visible, draggable bar (.szl-scroll, positioned in JS) so a scrollbar shows
   regardless of the OS "show scroll bars" setting. */
html.lenis{scrollbar-width:none}
html.lenis::-webkit-scrollbar{display:none}
.szl .szl-scroll{position:fixed;top:0;right:0;width:12px;height:100vh;z-index:85;opacity:0;transition:opacity .35s;pointer-events:none}
.szl .szl-scroll::before{content:"";position:absolute;top:8px;bottom:8px;right:4px;width:4px;border-radius:4px;background:rgba(255,255,255,.08)}
.szl .szl-scroll-thumb{position:absolute;top:0;right:3px;width:6px;min-height:46px;border-radius:6px;background:rgba(244,165,44,.75);pointer-events:auto;cursor:grab;transition:background .2s,width .2s,right .2s}
.szl .szl-scroll-thumb:hover{background:var(--saffron);width:8px;right:2px}
.szl .szl-scroll-thumb.dragging{background:var(--saffron);width:8px;right:2px;cursor:grabbing}
@media(max-width:759px){.szl .szl-scroll{display:none}}
/* ── Scrollytelling story stage: pinned film backdrop + crossfading scenes ── */
.szl .story{position:relative;background:#0a0807}
.szl .story-stage{position:relative;height:100vh;width:100%;overflow:hidden}
.szl .story-bg{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.szl .story-veil{position:absolute;inset:0;pointer-events:none;background:linear-gradient(108deg,rgba(8,6,5,.88) 0%,rgba(8,6,5,.55) 40%,rgba(8,6,5,.16) 68%,rgba(8,6,5,.42) 100%)}
.szl .scene{position:absolute;inset:0;display:flex;align-items:center;will-change:opacity,transform;z-index:3}
.szl .scene .wrap{width:100%}
.szl .scene .ticket,.szl .scene .eyebrow{display:inline-block;margin-bottom:6px}
.szl .scene h1,.szl .scene h2{font-size:clamp(48px,7.4vw,104px);margin:14px 0 0;max-width:13ch;text-shadow:0 2px 40px rgba(0,0,0,.5)}
.szl .scene .sub{margin:26px 0 0;max-width:440px;font-size:18px;line-height:1.6;color:#e6dccf;text-shadow:0 1px 20px rgba(0,0,0,.6)}
.szl .scene .ctas{margin-top:32px}
.szl .scene .weblink{margin-top:18px}
.szl .scene-cta .wrap.center{text-align:center;max-width:720px;margin:0 auto}
.szl .scene-cta h2{margin-left:auto;margin-right:auto}
.szl .scene-cta .ctas{justify-content:center}
.szl .scene-cta .weblink{justify-content:center;width:100%}
/* Filmic roadmap timeline (replaces the old flat roadmap cards). */
.szl .roadline{display:flex;flex-wrap:wrap;gap:22px 0;margin-top:30px;max-width:780px}
.szl .roadline .rl{flex:1;min-width:130px;padding-right:18px}
.szl .roadline .rln{position:relative;display:block;font-family:var(--mono);font-size:13px;font-weight:600;color:var(--saffron);padding-top:12px;margin-bottom:9px}
.szl .roadline .rln::before{content:"";position:absolute;left:0;right:6px;top:0;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--saffron),rgba(244,165,44,.15))}
.szl .roadline .rl b{display:block;font-size:15px;font-weight:700;color:var(--on);margin-bottom:4px}
.szl .roadline .rl>span:not(.rln){display:block;font-size:12.5px;line-height:1.45;color:var(--soft)}
.szl .roadline .hot-step b{color:var(--saffron)}
.szl .roadline .hot-step .rln::before{background:linear-gradient(90deg,var(--accent),var(--saffron))}
.szl .scrollcue{position:absolute;left:50%;bottom:32px;transform:translateX(-50%);z-index:6;display:flex;flex-direction:column;align-items:center;gap:10px;font-family:var(--mono);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--soft);pointer-events:none}
.szl .scrollcue i{width:1px;height:46px;background:linear-gradient(var(--saffron),transparent);animation:sz-cue 1.9s ease-in-out infinite}
@keyframes sz-cue{0%,100%{opacity:.25;transform:scaleY(.4);transform-origin:top}50%{opacity:1;transform:scaleY(1)}}
/* Mobile / no-scrub fallback: the video is a fixed backdrop, scenes stack over it. */
@media(max-width:759px){
  .szl .story,.szl .story-stage{height:auto}
  .szl .story-bg{position:fixed;z-index:0}
  .szl .scene{position:relative;inset:auto;opacity:1!important;transform:none!important;min-height:94vh;padding:88px 0}
  .szl .scene .wrap{position:relative;z-index:2}
  .szl .scrollcue{display:none}
}
@media(prefers-reduced-motion:reduce){.szl .scrollcue i{animation:none}}
.szl *{margin:0;padding:0;box-sizing:border-box}
.szl a{color:inherit;text-decoration:none}
.szl .linkbtn{background:none;border:none;color:inherit;font-family:inherit;cursor:pointer}
.szl .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.szl .serif{font-family:var(--serif);font-weight:480;line-height:1.0;letter-spacing:-.018em;font-optical-sizing:auto}
.szl .ital{font-style:italic}
/* Emphasis: a solid warm word, no clipped-gradient cliché. */
.szl .hot{color:var(--saffron)}
/* Eyebrows + status read like a kitchen order ticket: mono, spaced, an ember tick. */
.szl .eyebrow{font-family:var(--mono);font-size:12px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--saffron)}
.szl .ticket{display:inline-flex;align-items:center;gap:9px;font-family:var(--mono);font-size:12.5px;font-weight:500;letter-spacing:.08em;text-transform:uppercase;color:var(--soft)}
.szl .ticket .tdot{width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent)}
.szl .ticket b{color:var(--on);font-weight:600}
.szl .btn{display:inline-flex;align-items:center;gap:10px;height:52px;padding:0 22px;border-radius:14px;font-weight:700;font-size:15px;cursor:pointer;border:none;transition:transform .15s}
.szl .btn:hover{transform:translateY(-2px)}
.szl .btn-accent{background:linear-gradient(180deg,#ff6a44,#ed4f2c);color:#fff;box-shadow:0 8px 24px rgba(237,79,44,.35)}
/* For the accent-orange CTA card, where .btn-accent would vanish into the background. */
.szl .btn-dark{background:#171008;color:#fff;box-shadow:0 8px 24px rgba(0,0,0,.28)}
.szl .nav{position:sticky;top:0;z-index:40;background:rgba(14,11,9,.72);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.szl .nav .row{display:flex;align-items:center;justify-content:space-between;height:72px}
.szl .brand{font-family:var(--serif);font-size:30px}
.szl .navlinks{display:flex;gap:26px;align-items:center}
.szl .navlinks a,.szl .navlinks .login{font-size:14.5px;color:var(--soft);font-weight:500;transition:color .15s}
.szl .navlinks a:hover,.szl .navlinks .login:hover{color:var(--on)}
.szl .nav .cta{height:42px;padding:0 18px;border-radius:11px}
@media(max-width:820px){.szl .navlinks a:not(.cta){display:none}.szl .navlinks{gap:14px}}
.szl .ctas{display:flex;gap:14px;flex-wrap:wrap;align-items:center}
.szl .weblink{display:inline-flex;align-items:center;gap:7px;font-weight:700;font-size:15px;margin-top:18px;color:var(--on)}
.szl .weblink .arr{color:var(--accent);transition:transform .15s}
.szl .weblink:hover .arr{transform:translateX(4px)}
.szl .phone{position:relative;width:300px;height:632px;border-radius:42px;background:#0a0706;border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 90px rgba(0,0,0,.55),inset 0 0 0 6px #000;overflow:hidden}
.szl .phone .screen{position:absolute;inset:8px;border-radius:34px;overflow:hidden;background:#120c09}
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
.szl .sec{padding:104px 0}
.szl .sec-head{text-align:center;max-width:760px;margin:0 auto}
.szl .sec-head.left{text-align:left;max-width:620px;margin:0}
.szl .sec-head h2{font-size:clamp(34px,5vw,58px);margin-top:14px}
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
/* Features over a dimmed food-film backdrop — depth + motion, still readable. */
.szl .feat-sec{position:relative;overflow:hidden}
.szl .feat-film{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.24;z-index:0;pointer-events:none}
.szl .feat-film-veil{position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(180deg,var(--bg) 0%,rgba(15,11,8,.72) 24%,rgba(15,11,8,.72) 76%,var(--bg) 100%)}
.szl .feat-sec>.wrap{position:relative;z-index:1}
.szl .feat-sec .fcard{background:rgba(23,17,12,.72);backdrop-filter:blur(8px);border-color:rgba(255,255,255,.09)}
.szl .feat-sec .feat-try{backdrop-filter:blur(8px)}
@media(max-width:560px){.szl .fgrid{grid-template-columns:1fr}}
.szl .trust-sec{position:relative;overflow:hidden;text-align:center;padding:130px 0}
.szl .trust-film{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.42;z-index:0;pointer-events:none}
.szl .trust-film-veil{position:absolute;inset:0;z-index:0;pointer-events:none;background:radial-gradient(120% 95% at 50% 50%,rgba(10,8,7,.5),rgba(10,8,7,.86) 78%)}
.szl .trust-sec>.wrap{position:relative;z-index:1}
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

/* See it in action — auto-cycling app demo */
.szl .demo-sec{padding:104px 0}
.szl .demo-grid{display:grid;grid-template-columns:1fr 340px;gap:56px;align-items:center}
.szl .demo-copy h2{font-size:clamp(34px,5vw,58px);margin:14px 0 16px}
.szl .demo-copy>p{color:var(--soft);font-size:17px;line-height:1.6;max-width:440px;margin-bottom:26px}
.szl .demo-steps{display:flex;flex-direction:column;gap:6px;max-width:440px}
.szl .demo-step{display:flex;gap:14px;align-items:flex-start;text-align:left;background:none;border:1px solid transparent;cursor:pointer;font-family:inherit;color:inherit;padding:14px 16px;border-radius:14px;transition:background .3s,border-color .3s}
.szl .demo-step .ds-n{font-family:var(--mono);font-size:12px;font-weight:600;color:var(--faint);padding-top:3px;transition:color .3s}
.szl .demo-step .ds-txt{display:flex;flex-direction:column;gap:2px}
.szl .demo-step .ds-txt b{font-size:16px;font-weight:700;color:var(--soft);transition:color .3s}
.szl .demo-step .ds-txt span{font-size:13.5px;color:var(--faint);line-height:1.4}
.szl .demo-step:hover{background:rgba(255,255,255,.03)}
.szl .demo-step.on{background:rgba(255,90,54,.08);border-color:rgba(255,90,54,.28)}
.szl .demo-step.on .ds-n{color:var(--accent)}
.szl .demo-step.on .ds-txt b{color:var(--on)}
.szl .demo-phone-wrap{display:flex;flex-direction:column;align-items:center;gap:22px;justify-self:center}
.szl .demo-phone{box-shadow:0 50px 110px rgba(0,0,0,.6)}
.szl .demo-screen{position:absolute;inset:0;opacity:0;transition:opacity .55s ease;pointer-events:none}
.szl .demo-screen.on{opacity:1;pointer-events:auto}
.szl .demo-dots{display:flex;gap:8px;justify-content:center}
.szl .demo-dots button{width:7px;height:7px;padding:0;border:none;border-radius:50%;background:rgba(255,255,255,.22);cursor:pointer;transition:all .35s}
.szl .demo-dots button.on{background:var(--accent);width:22px;border-radius:4px}
@media(max-width:860px){.szl .demo-grid{grid-template-columns:1fr;gap:34px;justify-items:center;text-align:center}.szl .demo-copy{max-width:440px}.szl .demo-copy>p{margin-left:auto;margin-right:auto}.szl .demo-steps{text-align:left}}

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
`;
