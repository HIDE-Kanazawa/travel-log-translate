export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial' }}>
      <h1>webhook-next is deployed</h1>
      <p>Health checks:</p>
      <ul>
        <li><a href="/api/ping">/api/ping</a></li>
        <li><a href="/api/webhook/sanity">/api/webhook/sanity</a> (GET should be 405)</li>
      </ul>
    </main>
  );
}
