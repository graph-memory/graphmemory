import React, {useState, useEffect, useCallback} from 'react';
import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import Heading from '@theme/Heading';
import s from './index.module.css';

/* ─── Data ─── */

const graphs = [
  {color: '#7b1fa2', title: 'Docs', desc: 'Markdown parsed into heading chunks with cross-file links and code blocks', href: '/docs/concepts/docs-indexing'},
  {color: '#f57c00', title: 'Code', desc: 'tree-sitter AST — functions, classes, interfaces, imports, relationships', href: '/docs/concepts/code-indexing'},
  {color: '#f9a825', title: 'Knowledge', desc: 'Persistent notes and facts with typed relations and cross-graph links', href: '/docs/concepts/knowledge-graph'},
  {color: '#1976d2', title: 'Tasks', desc: 'Kanban workflow with priorities, assignees, due dates, and linking', href: '/docs/concepts/tasks'},
  {color: '#9c27b0', title: 'Skills', desc: 'Reusable recipes with steps, triggers, and usage tracking', href: '/docs/concepts/skills'},
  {color: '#388e3c', title: 'Files', desc: 'Every project file with metadata, language detection, directory tree', href: '/docs/concepts/file-index'},
];

const toolGroups = [
  {group: 'Context', count: 1, color: '#78909c', href: '/docs/mcp-tools/context'},
  {group: 'Docs', count: 5, color: '#7b1fa2', href: '/docs/mcp-tools/docs'},
  {group: 'Code Blocks', count: 4, color: '#7b1fa2', href: '/docs/mcp-tools/code-blocks'},
  {group: 'Cross-Graph', count: 1, color: '#e65100', href: '/docs/mcp-tools/cross-graph'},
  {group: 'Code', count: 5, color: '#f57c00', href: '/docs/mcp-tools/code'},
  {group: 'File Index', count: 3, color: '#388e3c', href: '/docs/mcp-tools/file-index'},
  {group: 'Knowledge', count: 12, color: '#f9a825', href: '/docs/mcp-tools/knowledge'},
  {group: 'Tasks', count: 13, color: '#1976d2', href: '/docs/mcp-tools/tasks'},
  {group: 'Skills', count: 14, color: '#9c27b0', href: '/docs/mcp-tools/skills'},
];

const clients = [
  {id: 'claude-code', label: 'Claude Code', desc: 'Run in your project directory:', code: 'claude mcp add --transport http \\\n  --scope project graph-memory \\\n  http://localhost:3000/mcp/my-project'},
  {id: 'desktop', label: 'Claude Desktop', desc: 'Settings \u2192 Connectors \u2192 Add URL:', code: 'http://localhost:3000/mcp/my-project'},
  {id: 'cursor', label: 'Cursor', desc: 'Add to .cursor/mcp.json:', code: '{\n  "mcpServers": {\n    "graph-memory": {\n      "type": "http",\n      "url": "http://localhost:3000/mcp/my-project"\n    }\n  }\n}'},
  {id: 'windsurf', label: 'Windsurf', desc: 'Add to .windsurf/mcp.json:', code: '{\n  "mcpServers": {\n    "graph-memory": {\n      "type": "http",\n      "url": "http://localhost:3000/mcp/my-project"\n    }\n  }\n}'},
];

const prodFeatures = [
  {title: 'Auth & Security', href: '/docs/security/authentication', items: ['JWT + API keys', 'scrypt passwords', 'Rate limiting']},
  {title: 'Access Control', href: '/docs/security/access-control', items: ['4-level ACL', 'Per-graph readonly', 'Per-user permissions']},
  {title: 'Scale', href: '/docs/guides/multi-project', items: ['Multi-project', 'Shared workspaces', 'Real-time sync']},
  {title: 'Deploy', href: '/docs/getting-started/docker', items: ['npm package', 'Docker multi-arch', 'Zero-config mode']},
];

/* ─── Typing animation ─── */

const words = ['understanding', 'structure', 'connections', 'memory', 'context'];

function Typewriter() {
  const [wi, setWi] = useState(0);
  const [text, setText] = useState('');
  const [del, setDel] = useState(false);
  const w = words[wi];

  const tick = useCallback(() => {
    if (!del) {
      if (text.length < w.length) setText(w.slice(0, text.length + 1));
      else { setTimeout(() => setDel(true), 2000); return; }
    } else {
      if (text.length > 0) setText(w.slice(0, text.length - 1));
      else { setDel(false); setWi(i => (i + 1) % words.length); return; }
    }
  }, [text, del, w]);

  useEffect(() => {
    const t = setTimeout(tick, del ? 40 : 70);
    return () => clearTimeout(t);
  }, [tick, del]);

  return <span className={s.gradient}>{text}<span className={s.caret} /></span>;
}

/* ─── Sections ─── */

const installCmd = 'npm install -g @graphmemory/server && graphmemory serve';

function Hero() {
  const {siteConfig} = useDocusaurusContext();
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    try {
      navigator.clipboard.writeText('npm install -g @graphmemory/server && graphmemory serve');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  }, []);

  return (
    <header className={s.hero}>
      <div className={s.heroGlow} />
      <div className={clsx('container', s.heroInner)}>
        <Heading as="h1" className={s.heroTitle}>{siteConfig.title}</Heading>
        <p className={s.heroSub}>
          Semantic graph memory for AI&#8209;powered development.<br />
          Index docs, code, and files into six interconnected graphs.<br />
          Query with 58 MCP tools or the built&#8209;in Web UI.
        </p>
        <div className={s.terminal} onClick={copy} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(); } }}>
          <div className={s.termHeader}>
            <div className={s.termDots}><i /><i /><i /></div>
            <button className={s.termCopy} onClick={(e) => { e.stopPropagation(); copy(); }} aria-label="Copy command">
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M13.5 4.5L6.5 11.5L2.5 7.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/><path d="M4 11H3.5A1.5 1.5 0 012 9.5v-7A1.5 1.5 0 013.5 1h7A1.5 1.5 0 0112 2.5V3" stroke="currentColor" strokeWidth="1.5"/></svg>
              )}
              <span>{copied ? 'Copied!' : 'Copy'}</span>
            </button>
          </div>
          <code><span className={s.termPrompt}>$</span> {installCmd}</code>
        </div>
        <div className={s.heroCta}>
          <Link className={clsx('button button--lg', s.btnFill)} to="/docs/getting-started">Get Started</Link>
          <Link className={clsx('button button--lg', s.btnGhost)} href="https://github.com/graph-memory/graphmemory">GitHub</Link>
        </div>
        <div className={s.heroBadges}>
          <span className={s.badge}>Open Source</span>
          <span className={s.badge}>Free to Use</span>
          <span className={s.badge}>Runs Locally</span>
        </div>
      </div>
    </header>
  );
}

function Why() {
  return (
    <section className={s.sec}>
      <div className="container">
        <Heading as="h2" className={s.h2}>Not just search — <Typewriter /></Heading>
        <p className={s.lead}>Graph Memory doesn't just find text — it understands how your project is structured.</p>
        <div className={s.triGrid}>
          {[
            {title: 'Indexes Structure', desc: 'Parses AST symbols, heading hierarchies, and file metadata — not just raw text.',
             href: '/docs/concepts/code-indexing',
             svg: <><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/><line x1="14" y1="4" x2="10" y2="20"/></>},
            {title: 'Links Everything', desc: 'Cross-graph relationships connect code to docs, notes to tasks, skills to symbols.',
             href: '/docs/concepts/cross-graph-links',
             svg: <><circle cx="7" cy="12" r="3"/><circle cx="17" cy="12" r="3"/><path d="M10 12h4"/></>},
            {title: 'Remembers Context', desc: 'Knowledge, tasks, and skills persist across conversations. Your AI never forgets.',
             href: '/docs/concepts/knowledge-graph',
             svg: <><path d="M12 2a4 4 0 014 4v2a4 4 0 01-8 0V6a4 4 0 014-4z"/><path d="M20 21v-2a4 4 0 00-3-3.87"/><path d="M4 21v-2a4 4 0 013-3.87"/></>},
          ].map(({title, desc, href, svg}) => (
            <Link key={title} className={s.card} to={href} style={{textDecoration: 'none', color: 'inherit'}}>
              <div className={s.cardIcon}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{svg}</svg>
              </div>
              <h3 className={s.cardTitle}>{title}</h3>
              <p className={s.cardText}>{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Graphs() {
  return (
    <section className={s.secAlt}>
      <div className="container">
        <Heading as="h2" className={s.h2}>Six Interconnected Graphs</Heading>
        <p className={s.lead}>Your project, understood as structure — not just text.</p>
        <div className={s.sixGrid}>
          {graphs.map(({color, title, desc, href}) => (
            <Link key={title} className={s.gCard} to={href} style={{'--gc': color, textDecoration: 'none', color: 'inherit'} as React.CSSProperties}>
              <div className={s.gBar} style={{background: color}} />
              <h3 className={s.gTitle}>{title}</h3>
              <p className={s.cardText}>{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Steps() {
  return (
    <section className={s.secAlt}>
      <div className="container">
        <Heading as="h2" className={s.h2}>Up and running in 3 steps</Heading>
        <div className={s.steps}>
          {[
            {n: '1', title: 'Install', code: 'npm install -g @graphmemory/server'},
            {n: '2', title: 'Serve', code: 'graphmemory serve'},
            {n: '3', title: 'Connect', code: 'Claude \u00b7 Cursor \u00b7 Windsurf'},
          ].map(({n, title, code}, i) => (
            <React.Fragment key={n}>
              {i > 0 && <div className={s.stepLine} />}
              <div className={s.step}>
                <div className={s.stepBubble}>{n}</div>
                <h3 className={s.stepTitle}>{title}</h3>
                <code className={s.stepCode}>{code}</code>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function Tools() {
  return (
    <section className={s.secAlt}>
      <div className="container">
        <Heading as="h2" className={s.h2}>58 MCP Tools</Heading>
        <p className={s.lead}>Search, create, link, and manage — all from your AI assistant.</p>
        <div className={s.pills}>
          {toolGroups.map(({group, count, color, href}) => (
            <Link key={group} className={s.pill} to={href} style={{textDecoration: 'none', color: 'inherit'}}>
              <span className={s.pillDot} style={{background: color}} />
              {group} <strong>{count}</strong>
            </Link>
          ))}
        </div>
        <div className={s.center}>
          <Link className={clsx('button button--lg', s.btnFill)} to="/docs/mcp-tools">View full reference</Link>
        </div>
      </div>
    </section>
  );
}

function Clients() {
  const [active, setActive] = useState('claude-code');
  const cur = clients.find(c => c.id === active)!;
  return (
    <section className={s.sec}>
      <div className="container">
        <Heading as="h2" className={s.h2}>Connect Any MCP Client</Heading>
        <div className={s.tabPanel}>
          <nav className={s.tabBar}>
            {clients.map(({id, label}) => (
              <button key={id} className={clsx(s.tab, active === id && s.tabOn)} onClick={() => setActive(id)}>{label}</button>
            ))}
          </nav>
          <div className={s.tabBody}>
            <p className={s.tabDesc}>{cur.desc}</p>
            <pre className={s.tabPre}><code>{cur.code}</code></pre>
          </div>
        </div>
        <div className={s.center}>
          <Link className={clsx('button button--lg', s.btnGhost)} to="/docs/guides/mcp-clients">Full setup guide →</Link>
        </div>
      </div>
    </section>
  );
}

function Production() {
  return (
    <section className={s.sec}>
      <div className="container">
        <Heading as="h2" className={s.h2}>Production Ready</Heading>
        <p className={s.lead}>Everything you need to ship — out of the box.</p>
        <div className={s.prodGrid}>
          {prodFeatures.map(({title, href, items}) => (
            <Link key={title} className={s.card} to={href} style={{textDecoration: 'none', color: 'inherit'}}>
              <h3 className={s.cardTitle}>{title}</h3>
              <ul className={s.checks}>
                {items.map(item => (
                  <li key={item}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11.5 3.5L5.5 10.5L2 7" stroke="var(--ifm-color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    {item}
                  </li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function WebUI() {
  const screens = [
    {title: 'Dashboard', desc: 'Stats, recent activity, quick actions', img: '/img/screenshots/dashboard-dark.png'},
    {title: 'Kanban Board', desc: 'Drag-drop tasks across columns', img: '/img/screenshots/tasks-kanban-dark.png'},
    {title: 'Graph Visualization', desc: 'Interactive Cytoscape.js force-directed graph', img: '/img/screenshots/graph-dark.png'},
    {title: 'Unified Search', desc: 'One query across all six graphs', img: '/img/screenshots/search-dark.png'},
  ];
  return (
    <section className={s.sec}>
      <div className="container">
        <Heading as="h2" className={s.h2}>Built-in Web UI</Heading>
        <p className={s.lead}>Full-featured interface included — no extra setup needed.</p>
        <div className={s.uiGrid}>
          {screens.map(({title, desc, img}) => (
            <Link key={title} className={s.uiCard} to="/docs/web-ui" style={{textDecoration: 'none', color: 'inherit'}}>
              <img src={img} alt={title} className={s.uiScreenshot} loading="lazy" />
              <h4 className={s.uiCardTitle}>{title}</h4>
              <p className={s.cardText}>{desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function PromptBuilder() {
  return (
    <section className={s.sec}>
      <div className="container">
        <Heading as="h2" className={s.h2}>AI Prompt Builder</Heading>
        <p className={s.lead}>Generate optimized system prompts for any MCP-connected AI assistant.</p>
        <div className={s.pbGrid}>
          <div className={s.pbFeatures}>
            {[
              {title: '14 Scenarios', desc: 'Onboarding, Code Review, Architecture, Incident Response, and more'},
              {title: '8 Roles & 6 Styles', desc: 'Developer, Architect, Reviewer, Tech Writer — Proactive, Reactive, Read-only...'},
              {title: '9 Tech Domains', desc: 'Languages, Frontend, Backend, Mobile, Data, DevOps, Testing, AI/ML, Project'},
              {title: 'Per-Tool Control', desc: 'Set priority for each of 57 tools: Always, Prefer, Available, Avoid, Disabled'},
              {title: 'Live Preview', desc: 'See your prompt update in real time with token estimation'},
            ].map(({title, desc}) => (
              <div key={title} className={s.pbItem}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={s.pbCheck}>
                  <path d="M13.5 4.5L6.5 11.5L2.5 7.5" stroke="var(--ifm-color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <strong>{title}</strong>
                  <span className={s.pbDesc}> — {desc}</span>
                </div>
              </div>
            ))}
          </div>
          <div className={s.pbPreview}>
            <img src="/img/screenshots/prompts-simple-dark.png" alt="Prompt Builder" className={s.screenshot} loading="lazy" style={{margin: 0, maxWidth: '100%'}} />
          </div>
        </div>
        <div className={s.center}>
          <Link className={clsx('button button--lg', s.btnFill)} to="/docs/prompt-builder">Explore Prompt Builder</Link>
        </div>
      </div>
    </section>
  );
}

function UseCases() {
  const cases = [
    {title: 'Project Onboarding', desc: 'New developer? Search docs, explore code symbols, read team notes — all from your AI assistant.', href: '/docs/use-cases/onboarding'},
    {title: 'Code Review', desc: 'Review PRs with full project context. Cross-reference code with docs and architecture decisions.', href: '/docs/use-cases/code-review'},
    {title: 'Team Knowledge Base', desc: 'Capture decisions, procedures, and patterns. Team members edit notes in their IDE via file mirror.', href: '/docs/use-cases/knowledge-base'},
    {title: 'Incident Response', desc: 'Debug production issues fast. Search code, check knowledge base, create tasks for fixes.', href: '/docs/use-cases/incident-response'},
  ];
  return (
    <section className={s.secAlt}>
      <div className="container">
        <Heading as="h2" className={s.h2}>Built for real workflows</Heading>
        <p className={s.lead}>See how teams use Graph Memory every day.</p>
        <div className={s.prodGrid}>
          {cases.map(({title, desc, href}) => (
            <Link key={title} className={s.card} to={href} style={{textDecoration: 'none', color: 'inherit'}}>
              <h3 className={s.cardTitle}>{title}</h3>
              <p className={s.cardText}>{desc}</p>
              <span className={s.cardArrow}>Learn more →</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className={s.ctaSection}>
      <div className="container">
        <Heading as="h2" className={s.ctaTitle}>Ready to give your AI a memory?</Heading>
        <p className={s.ctaSub}>Get started in under a minute. Free, open source, runs locally.</p>
        <div className={s.heroCta}>
          <Link className={clsx('button button--lg', s.btnFill)} to="/docs/getting-started/quick-start">Quick Start</Link>
          <Link className={clsx('button button--lg', s.btnGhost)} to="/docs/getting-started">Read the Docs</Link>
        </div>
      </div>
    </section>
  );
}

/* ─── Page ─── */

export default function Home(): React.JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return (
    <Layout title={siteConfig.tagline} description="MCP server that builds semantic graph memory from project directories. 58 MCP tools, Web UI, hybrid search.">
      <Hero />
      <main>
        <Why />
        <Steps />
        <PromptBuilder />
        <Graphs />
        <WebUI />
        <Tools />
        <Clients />
        <UseCases />
        <Production />
        <FinalCTA />
      </main>
    </Layout>
  );
}
