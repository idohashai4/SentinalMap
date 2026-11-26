// GET /api/x-video?id=<post id>  ->  { videos: [{ src, poster, width, height }], text }
//
// The video file(s) of a public X post, so the app can play just the video
// instead of embedding the whole post. Read from X's public embed data service
// (the one its own embedded posts use); no account or key is needed.
import { isAllowedUser } from "./_auth.js";

// The token that service expects, derived from the post id the way X's embed code derives it.
const token = (id) => ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");

const MAX_BITRATE = 2_500_000; // up to ~720p: sharp enough, light enough to start quickly

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (!(await isAllowedUser(req))) return res.status(401).json({ error: "Sign in required" });

  const id = String(req.query.id || "");
  if (!/^\d{5,25}$/.test(id)) return res.status(400).json({ error: "Invalid post id" });

  let data;
  try {
    const r = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&lang=en&token=${token(id)}`, {
      headers: { Accept: "application/json" },
    });
    if (r.status === 404) return res.status(404).json({ error: "Post not found or not public" });
    if (!r.ok) return res.status(502).json({ error: `X returned ${r.status}` });
    data = await r.json();
  } catch (e) {
    return res.status(502).json({ error: "X is unreachable" });
  }

  // A quote post's own media, or the media of the post it quotes.
  const media = [...(data.mediaDetails || []), ...(data.quoted_tweet?.mediaDetails || [])];
  const videos = media
    .filter((m) => m.type === "video" || m.type === "animated_gif")
    .map((m) => {
      const mp4 = (m.video_info?.variants || [])
        .filter((v) => v.content_type === "video/mp4")
        .sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
      const pick = [...mp4].reverse().find((v) => (v.bitrate || 0) <= MAX_BITRATE) || mp4[0];
      return pick && {
        src: pick.url,
        poster: m.media_url_https || "",
        width: m.original_info?.width || 16,
        height: m.original_info?.height || 9,
        gif: m.type === "animated_gif",
      };
    })
    .filter(Boolean);

  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.status(200).json({ videos, text: data.text || "" });
}
