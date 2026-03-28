const kv = await Deno.openKv();

Deno.serve({ port: 8000 }, async (req: Request) => {
  const url = new URL(req.url);

  if (url.pathname === "/api/items") {
    const items = [];
    for await (const entry of kv.list({ prefix: ["items"] })) {
      items.push(entry.value);
    }
    return new Response(JSON.stringify(items), {
      headers: { "content-type": "application/json" },
    });
  }

  return new Response("Not Found", { status: 404 });
});
