import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Legal Notice — lets-talk-about',
};

export default function LegalPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--surface)',
      color: 'var(--text)',
      padding: '48px 24px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <div style={{ maxWidth: 520, width: '100%' }}>
        <Link
          href="/"
          style={{
            fontSize: 11,
            color: 'var(--accent)',
            textDecoration: 'none',
            marginBottom: 32,
            display: 'inline-block',
          }}
        >
          &larr; back
        </Link>

        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)', margin: '0 0 32px' }}>
          Impressum / Legal Notice
        </h1>

        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Provider
          </h2>
          <p style={{ fontSize: 13, lineHeight: '22px', margin: 0, color: 'var(--text)' }}>
            Tamino Martinius<br />
            Lehdenstr. 21<br />
            06847 Dessau-Ro&szlig;lau<br />
            Germany
          </p>
        </section>

        <section>
          <h2 style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Contact
          </h2>
          <p style={{ fontSize: 13, lineHeight: '22px', margin: 0 }}>
            Email:{' '}
            <a
              href="mailto:contact@tamino.dev"
              style={{ color: 'var(--accent)', textDecoration: 'none' }}
            >
              contact@tamino.dev
            </a>
          </p>
        </section>
      </div>
    </div>
  );
}
