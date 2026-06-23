import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, useGSAP);

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

  // Pinned 3D process deck — desktop + motion only; useGSAP auto-cleans up.
  useGSAP(
    () => {
      if (!window.matchMedia('(min-width: 901px)').matches) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const proc = root.current!.querySelector('.process');
      if (!proc) return;
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

      // Cinematic "feed to plate" clip: pin the section and scrub the video's
      // playhead from scroll progress (Apple-style scrollytelling).
      const cine = root.current!.querySelector<HTMLElement>('.cinema');
      const vid = root.current!.querySelector<HTMLVideoElement>('.cinema video');
      if (cine && vid) {
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
          end: '+=' + window.innerHeight * 2.2,
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

  // Lazy-register the <model-viewer> custom element only on the landing, so it
  // never weighs down the main app bundle.
  useEffect(() => {
    void import('@google/model-viewer');
  }, []);

  return (
    <div className="szl" ref={root}>
      <style>{CSS}</style>

      {/* NAV */}
      <nav className="nav">
        <div className="wrap row">
          <button className="brand linkbtn" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>Sizzle</button>
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
          src="/landing/feed-to-plate.mp4"
          poster="/landing/feed-to-plate-poster.jpg"
          muted
          playsInline
          autoPlay
          loop
          preload="auto"
        />
        <div className="cinemaveil" />
        <div className="cinemacap wrap">
          <span className="eyebrow">From feed to plate</span>
          <h2 className="serif">Scroll the feed.<br /><span className="grad ital">Watch it come to life.</span></h2>
        </div>
      </section>

      {/* HERO */}
      <header className="hero" id="top">
        <div className="wrap grid">
          <div>
            <span className="pill"><span className="dot" /> TikTok for recipes</span>
            <h1 className="serif">Watch it.<br />Scale it.<br /><span className="grad ital">Cook it.</span></h1>
            <p className="sub">A full-screen video feed of real recipes from real home cooks. Swipe to discover, tap once for a clean, scalable recipe, and cook along — no ten-paragraph life stories, no ads, no tracking.</p>
            <div className="ctas">
              <button className="store" onClick={app}><span className="ico"></span><span><span className="l1">Download on the</span><br /><span className="l2">App Store</span></span></button>
              <button className="store" onClick={app}><span className="ico">▶</span><span><span className="l1">Get it on</span><br /><span className="l2">Google Play</span></span></button>
            </div>
            <button className="weblink linkbtn" onClick={app}>Or open the web app <span className="arr">→</span></button>
            <div className="trust"><span><span className="d" />No ads</span><span><span className="d" />No tracking</span><span><span className="d" />13+</span></div>
          </div>
          <div className="phone-stage">
            <div className="phone"><div className="screen">
              <div className="feedbg" />
              <div className="pstatus"><span>9:41</span><span>●  ▮▮▮  ▰</span></div>
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
                <span className="chip">JAPANESE · 25 MIN</span>
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
                <div className="step-lab">Step 01</div>
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
                <div className="step-lab">Step 02</div>
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
                <div className="step-lab">Step 03</div>
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
                <div className="step-lab">Step 04</div>
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

      {/* 3D DISH — real generated GLB (Higgsfield image_to_3d), drag to rotate */}
      <section className="sec d3" id="dish"><div className="wrap d3grid">
        <div>
          <span className="eyebrow">See it from every angle</span>
          <h2 className="serif">A real dish,<br /><span className="grad ital">in your hands.</span></h2>
          <p className="sub">Every recipe on Sizzle is a real plate of food. Grab it, give it a spin, get hungry — then swipe to cook it yourself.</p>
          <button className="btn btn-accent cta" onClick={app}>Start cooking</button>
        </div>
        <div className="d3stage">
          <model-viewer
            src="/landing/dish.glb"
            poster="/landing/dish3d-poster.jpg"
            alt="A 3D plated dish you can rotate"
            camera-controls
            auto-rotate
            rotation-per-second="22deg"
            interaction-prompt="none"
            disable-zoom
            exposure="1.05"
            shadow-intensity="1.1"
            environment-image="neutral"
            camera-orbit="20deg 72deg 2.5m"
            min-camera-orbit="auto 40deg auto"
            max-camera-orbit="auto 95deg auto"
            touch-action="pan-y"
            style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
          />
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
        <h2 className="serif">No ads. No tracking.<br /><span className="grad ital">Just good food.</span></h2>
        <p>Privacy-first by design — no third-party tracking, ever. Built for everyone 13 and up.</p>
        <div className="trust-links"><a href="/privacy">Privacy Policy</a><span className="sep">·</span><a href="/terms">Terms of Service</a><span className="sep">·</span><a href="/cookie-policy">Cookie Policy</a></div>
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

      {/* FOOTER */}
      <footer className="foot-wrap"><div className="wrap foot">
        <div className="brand-col">
          <div className="brand serif">Sizzle</div>
          <p className="tag">Watch it. Scale it. Cook it. The home for real recipes from real cooks — at getsizzle.app.</p>
        </div>
        <div className="fcol"><h6>Product</h6><a href="#how">How it works</a><a href="#features">Features</a><a href="#creators">For creators</a><button className="linkbtn fl" onClick={app}>Get the app</button></div>
        <div className="fcol"><h6>Legal</h6><a href="/privacy">Privacy Policy</a><a href="/terms">Terms of Service</a><a href="/cookie-policy">Cookie Policy</a><a href="/contact">Contact</a></div>
      </div>
      <div className="foot-base wrap"><span>© 2026 Sizzle. All rights reserved.</span><span>No ads · No tracking · 13+</span></div>
      </footer>
    </div>
  );
}

const CSS = `
.szl{--bg:#0e0b09;--bg2:#16100c;--accent:#ff5a36;--saffron:#f4a52c;--on:#f4ece5;--soft:#c3b3a6;--faint:#8b7a6c;--line:rgba(255,255,255,.10);--serif:'Instrument Serif',Georgia,serif;--sans:'Hanken Grotesk',-apple-system,sans-serif;background:var(--bg);color:var(--on);font-family:var(--sans);overflow-x:hidden}
.szl *{margin:0;padding:0;box-sizing:border-box}
.szl a{color:inherit;text-decoration:none}
.szl .linkbtn{background:none;border:none;color:inherit;font-family:inherit;cursor:pointer}
.szl .wrap{max-width:1180px;margin:0 auto;padding:0 24px}
.szl .serif{font-family:var(--serif);font-weight:400;line-height:1.02;letter-spacing:-.01em}
.szl .ital{font-style:italic}
.szl .grad{background:linear-gradient(105deg,var(--accent),var(--saffron));-webkit-background-clip:text;background-clip:text;color:transparent}
.szl .eyebrow{font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--accent)}
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
@media(max-width:820px){.szl .navlinks a:not(.cta),.szl .navlinks .login{display:none}}
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
.szl .chip{display:inline-block;margin:8px 0 6px;padding:4px 9px;border-radius:7px;background:rgba(255,255,255,.16);font-size:10.5px;font-weight:700;letter-spacing:.05em;color:#fff}
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
.szl .step-num{position:absolute;top:18px;right:34px;font-family:var(--serif);font-size:160px;line-height:1;opacity:.10;z-index:1}
.szl .step-card.cream .step-num{color:var(--accent);opacity:.16}
.szl .step-lab{font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}
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
@media(max-width:900px){.szl .step-inner{grid-template-columns:1fr;gap:24px}.szl .step-card{padding:30px}.szl .step-num{font-size:96px;top:10px;right:18px}.szl .step-card .phone-stage{transform:scale(.82);justify-self:center}}
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
`;
