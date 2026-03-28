const kv = await Deno.openKv();

Deno.serve({ port: 8000 }, async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/api/counter") {
    const counter = await kv.get(["counter"]);
    const value = (counter.value as number ?? 0) + 1;
    await kv.set(["counter"], value);
    return new Response(JSON.stringify({ count: value }), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
});
