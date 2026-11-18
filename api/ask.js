// KI-Tutor für eine Karteikarte: leitet die Frage an die Claude-API weiter und streamt
// die Antwort als reinen Text zurück.
// Vercel-Umgebungsvariablen:
//   ANTHROPIC_API_KEY  (Pflicht)  – API-Schlüssel von console.anthropic.com
//   KK_MODEL           (optional) – Modell, Standard: claude-sonnet-5-5
//   ACCESS_CODE        (optional) – wenn gesetzt, muss die App diesen Code mitschicken
export const config = { runtime: "edge" };

const MAX_MSGS = 16;
const MAX_CHARS = 4000;

const json = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8" } });

const plain = html =>
  String(html || "")
    .replace(/<\/(p|li|tr|h\d|div)>/gi, "\n")
    .replace(/<(td|th)[^>]*>/gi, " | ")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim()
    .slice(0, MAX_CHARS);

export default async function handler(req) {
  if (req.method !== "POST") return json(405, { error: "Nur POST erlaubt." });

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(500, { error: "KI ist noch nicht eingerichtet: In Vercel die Umgebungsvariable ANTHROPIC_API_KEY setzen und neu deployen." });

  const code = process.env.ACCESS_CODE;
  if (code && req.headers.get("x-access-code") !== code) return json(401, { error: "Zugangscode fehlt oder ist falsch." });

  let body;
  try { body = await req.json(); } catch { return json(400, { error: "Ungültige Anfrage." }); }
  const { deck = "", topic = "", q = "", a = "", revealed = false } = body || {};
  const msgs = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MSGS) : [];
  const messages = msgs
    .filter(m => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }));
  if (!messages.length || messages[0].role !== "user" || messages[messages.length - 1].role !== "user")
    return json(400, { error: "Keine Frage gefunden." });

  const system = `Du bist ein geduldiger Tutor für eine Informatik-Vorlesung an der DHBW (Fach: ${String(deck).slice(0, 100)}).
Der Student lernt mit Karteikarten und hat eine Frage zu dieser Karte:

Thema: ${String(topic).slice(0, 100)}
Frage der Karte: ${plain(q)}
Musterantwort der Karte: ${plain(a)}

So antwortest du:
- Auf Deutsch, knapp und präzise (meist 3–10 Sätze), außer der Student will mehr.
- Erkläre das Warum, nicht nur das Was. Nutze kleine Beispiele oder Analogien, wenn sie helfen.
- Bleib bei der Musterantwort und dem Vorlesungsstoff; sag klar, wenn etwas darüber hinausgeht.
- Formatierung: Markdown (**fett**, Listen, \`code\`), Formeln in LaTeX mit $…$ bzw. $$…$$.
${revealed ? "" : "- Der Student hat die Antwort noch NICHT aufgedeckt. Verrate die Musterantwort nicht direkt, sondern gib Denkanstöße und Hinweise – außer er bittet ausdrücklich um die Lösung.\n"}`;

  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: process.env.KK_MODEL || "claude-sonnet-5-5", max_tokens: 1200, stream: true, system, messages })
  });
  if (!upstream.ok || !upstream.body) {
    let detail = "";
    try { detail = (await upstream.json())?.error?.message || ""; } catch { }
    return json(502, { error: `Die KI-Anfrage ist fehlgeschlagen (${upstream.status})${detail ? ": " + detail : ""}.` });
  }

  // SSE der API → reiner Textstrom
  const dec = new TextDecoder(), enc = new TextEncoder();
  let buf = "";
  const out = upstream.body.pipeThrough(new TransformStream({
    transform(chunk, ctl) {
      buf += dec.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        try {
          const ev = JSON.parse(line.slice(5));
          if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") ctl.enqueue(enc.encode(ev.delta.text));
          else if (ev.type === "error") ctl.enqueue(enc.encode("\n\n_(Fehler: " + (ev.error?.message || "unbekannt") + ")_"));
        } catch { }
      }
    }
  }));
  return new Response(out, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
