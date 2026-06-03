export async function onRequestPost(context) {
  const apiKey = context.env.GEMINI_API_KEY; // matches your secret's name
  const body   = await context.request.json();

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    }
  );

  const data = await res.json();
  return Response.json(data);
}