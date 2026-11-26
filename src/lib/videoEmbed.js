// Turns a video link into something that plays inside the app.
// Returns { type: "iframe", src, ratio } | { type: "video", src } | null.

export function videoEmbed(rawUrl) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
  } catch (e) {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|mobile)\./, "");
  const path = url.pathname;

  // YouTube: watch?v=, youtu.be/, shorts/, live/, embed/
  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    const id =
      host === "youtu.be" ? path.slice(1).split("/")[0]
        : url.searchParams.get("v") || (path.match(/^\/(?:shorts|live|embed)\/([\w-]{6,})/) || [])[1];
    if (!id) return null;
    const start = parseInt(url.searchParams.get("t") || url.searchParams.get("start") || "0", 10) || 0;
    return { type: "iframe", src: `https://www.youtube-nocookie.com/embed/${id}${start ? `?start=${start}` : ""}`, ratio: path.startsWith("/shorts/") ? "9 / 16" : "16 / 9" };
  }

  // Vimeo
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = (path.match(/(\d{6,})/) || [])[1];
    return id ? { type: "iframe", src: `https://player.vimeo.com/video/${id}`, ratio: "16 / 9" } : null;
  }

  // X / Twitter post: the embedded post plays its video.
  if (host === "x.com" || host === "twitter.com") {
    const id = (path.match(/\/status(?:es)?\/(\d+)/) || [])[1];
    return id ? { type: "iframe", src: `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true`, height: 560 } : null;
  }

  // Telegram public channel post
  if (host === "t.me" || host === "telegram.me") {
    const m = path.match(/^\/(?:s\/)?([\w]{4,})\/(\d+)/);
    return m ? { type: "iframe", src: `https://t.me/${m[1]}/${m[2]}?embed=1&mode=tme&dark=1`, height: 520 } : null;
  }

  // A video file
  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(path)) return { type: "video", src: url.href };

  return null;
}
