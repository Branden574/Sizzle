import { useState } from 'react';
import {
  Button,
  ButtonGroup,
  FilterChip,
  FloatingActionButton,
  FollowButton,
  GlassButton,
  IconButton,
  ReactionButton,
  SegmentedControl,
  type FollowState,
} from './controls';
import { GlowButton } from './glow';
import { BookmarkIcon, ChevronLeftIcon, DotsIcon, NavPlusIcon, ShareIcon } from './icons';

const filters = ['Nearby', 'Trending', 'Under 30 min'] as const;

function ThemeBoard({ theme }: { theme: 'light' | 'dark' }) {
  const [filter, setFilter] = useState<(typeof filters)[number]>('Trending');
  const [segment, setSegment] = useState<'foryou' | 'following'>('foryou');
  const [saved, setSaved] = useState(true);
  const [followState, setFollowState] = useState<FollowState>('follow');

  return (
    <section className="sz-stage sz-showcase-theme" data-theme={theme} aria-label={`${theme} mode controls`}>
      <header className="sz-showcase-board__header">
        <div>
          <span className="sz-showcase-kicker">{theme} material</span>
          <h2>{theme === 'light' ? 'Warm and grounded' : 'Rich, never hazy'}</h2>
        </div>
        <IconButton label="More showcase options" variant="outline" size="sm"><DotsIcon size={18} fill="currentColor" /></IconButton>
      </header>

      <div className="sz-showcase-section">
        <h3>Action hierarchy</h3>
        <ButtonGroup className="sz-showcase-wrap" label="Button hierarchy">
          <Button variant="primary" leadingIcon={<NavPlusIcon size={18} />}>Create post</Button>
          <Button variant="secondary">View restaurant</Button>
          <Button variant="tonal">Add a comment</Button>
          <Button variant="outline">Preview</Button>
          <Button variant="text">Not now</Button>
          <Button variant="danger">Delete post</Button>
        </ButtonGroup>
      </div>

      <div className="sz-showcase-section">
        <h3>Rare moments · glow CTA</h3>
        <ButtonGroup className="sz-showcase-wrap" label="Glow call to action">
          <GlowButton size="lg" haptic="success">Create your first Sizzle</GlowButton>
          <GlowButton size="lg" mode="static" blur="soft" glowScale={1.03}>Get started</GlowButton>
          <GlowButton size="lg" loading loadingLabel="Publishing…">Publish</GlowButton>
          <GlowButton size="lg" disabled>Get started</GlowButton>
        </ButtonGroup>
      </div>

      <div className="sz-showcase-section">
        <h3>Interaction states</h3>
        <ButtonGroup className="sz-showcase-wrap" label="Interaction states">
          <Button variant="primary">Default</Button>
          <Button variant="primary" data-demo-state="hover">Hover</Button>
          <Button variant="primary" data-demo-state="pressed">Pressed</Button>
          <Button variant="outline" data-demo-state="focus">Focus</Button>
          <Button variant="primary" loading loadingLabel="Posting…">Create post</Button>
          <Button variant="primary" success successLabel="Posted">Create post</Button>
          <Button variant="primary" error errorLabel="Try again">Create post</Button>
          <Button variant="primary" disabled>Unavailable</Button>
        </ButtonGroup>
      </div>

      <div className="sz-showcase-section">
        <h3>Selection and social</h3>
        <div className="sz-showcase-stack">
          <ButtonGroup className="sz-showcase-wrap" label="Recipe filters">
            {filters.map((item, index) => (
              <FilterChip key={item} selected={filter === item} count={index === 1 ? 24 : undefined} onClick={() => setFilter(item)}>{item}</FilterChip>
            ))}
          </ButtonGroup>
          <SegmentedControl
            label="Feed"
            value={segment}
            options={[{ value: 'foryou', label: 'For you' }, { value: 'following', label: 'Following' }]}
            onChange={setSegment}
          />
          <ButtonGroup className="sz-showcase-wrap" label="Social controls">
            <ReactionButton reaction="like" active count="1.2K" />
            <ReactionButton reaction="comment" count={84} />
            <ReactionButton reaction="save" active={saved} count={312} onClick={() => setSaved((value) => !value)} />
            <ReactionButton reaction="share" count={46} />
            <FollowButton
              name="Maya"
              state={followState}
              onClick={() => setFollowState((value) => value === 'follow' ? 'following' : 'follow')}
            />
          </ButtonGroup>
        </div>
      </div>

      <div className="sz-showcase-section">
        <h3>Media overlay</h3>
        <div className="sz-showcase-media">
          <img src="/recipes/miso-eggplant.jpg" alt="Glazed miso eggplant" />
          <div className="sz-showcase-media__top">
            <IconButton label="Back" variant="glass"><ChevronLeftIcon stroke="#fff" /></IconButton>
            <IconButton label="Share recipe" variant="glass"><ShareIcon size={20} /></IconButton>
          </div>
          <div className="sz-showcase-media__rail">
            <ReactionButton reaction="like" active count="18K" onMedia />
            <ReactionButton reaction="save" count="2.4K" onMedia />
          </div>
          <GlassButton leadingIcon={<BookmarkIcon size={18} stroke="#fff" />} className="sz-showcase-media__cta">View recipe</GlassButton>
        </div>
      </div>

      <div className="sz-showcase-section">
        <h3>Responsive sizing</h3>
        <ButtonGroup className="sz-showcase-wrap" label="Button sizes">
          <Button variant="tonal" size="xs">Extra small</Button>
          <Button variant="tonal" size="sm">Compact</Button>
          <Button variant="primary" size="md">Standard</Button>
          <Button variant="primary" size="lg">Mobile CTA</Button>
          <Button variant="outline" fullWidth>Long localized action label remains stable</Button>
          <FloatingActionButton label="Create a Sizzle"><NavPlusIcon size={24} /></FloatingActionButton>
        </ButtonGroup>
      </div>
    </section>
  );
}

export function ButtonShowcase() {
  return (
    <main className="sz-button-showcase">
      <div className="sz-showcase-intro">
        <span className="sz-showcase-kicker">Sizzle control system · development preview</span>
        <h1>Built for every tap between inspiration and dinner.</h1>
        <p>Warm solid actions anchor content. Adaptive glass appears only where controls float above media or navigation.</p>
      </div>
      <div className="sz-showcase-grid">
        <ThemeBoard theme="light" />
        <ThemeBoard theme="dark" />
      </div>
    </main>
  );
}
