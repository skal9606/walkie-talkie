import { Link } from 'react-router-dom'
import Seo from '../components/Seo'

// Lightweight post registry. Add an entry here when you publish a new post
// (and add its route in App.tsx + a URL in public/sitemap.xml).
const POSTS: { slug: string; title: string; date: string; description: string }[] = [
  {
    slug: 'how-to-practice-speaking-a-language-alone',
    title: 'How to Practice Speaking a Language Alone in 2026 (Without Feeling Silly)',
    date: 'July 16, 2026',
    description:
      'Six practical ways to practice speaking a language by yourself — from self-talk and shadowing to AI voice tutors — plus how to build a routine that sticks.',
  },
]

export default function Blog() {
  return (
    <div className="app legal">
      <Seo
        title="Blog — Language Learning Tips & Guides | Walkie Talkie"
        description="Practical guides on speaking practice, fluency, and learning a language faster with an AI voice tutor."
        path="/blog"
        type="website"
      />
      <nav className="tutor-nav">
        <Link to="/" className="tutor-nav-back">
          ← Back
        </Link>
      </nav>
      <header className="header">
        <h1>Blog</h1>
        <p className="subtitle">Tips and guides for speaking a new language with confidence.</p>
      </header>
      <article className="legal-body">
        {POSTS.map((post) => (
          <div key={post.slug} style={{ marginBottom: 32 }}>
            <h2 style={{ marginBottom: 4 }}>
              <Link to={`/blog/${post.slug}`}>{post.title}</Link>
            </h2>
            <p className="subtitle" style={{ marginTop: 0 }}>
              {post.date}
            </p>
            <p>{post.description}</p>
            <Link to={`/blog/${post.slug}`}>Read more →</Link>
          </div>
        ))}
      </article>
    </div>
  )
}
