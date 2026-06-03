export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const apiKey = context.env.GEMINI_API_KEY;
    if (!apiKey) return Response.json({ error: { message: 'GEMINI_API_KEY not set.' } }, { status: 500 });

    const body = await context.request.json();
    const res  = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:streamGenerateContent?alt=sse&key=${apiKey}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );

    return new Response(res.body, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    });
  } catch (err) {
    return Response.json({ error: { message: err.message } }, { status: 500 });
  }
}