/* Blog helpers: list rendering + a tiny, safe markdown formatter. */
window.WNBlog = (function () {
  const { esc } = WN;
  const d = (iso) => new Date(iso + "T12:00:00");
  // Dates on the 1st are shown as month + year (older recaps only have a month).
  const fmtDate = (iso) => d(iso).toLocaleDateString("en-CA", iso.endsWith("-01") ? { month: "long", year: "numeric" } : { month: "long", day: "numeric", year: "numeric" });
  const FALLBACK = "/img/hero/bg.webp";
  const monthYear = (iso) => d(iso).toLocaleDateString("en-CA", { month: "short", year: "numeric" }).replace(".", "");
  const meta = (p) => `<div class="post-meta">${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}<span class="m-date">${monthYear(p.published_at)} ·</span><span>${p.minutes} min read</span></div>`;

  function row(p) {
    const dt = d(p.published_at);
    return `<a class="post-row reveal" href="/blog/${encodeURIComponent(p.slug)}">
      <div class="date"><b>${dt.toLocaleDateString("en-CA", { month: "short" }).replace(".", "")}</b><span>${dt.getFullYear()}</span></div>
      <div>${meta(p)}<h3>${esc(p.title)}</h3><p>${esc(p.excerpt)}</p></div>
      <div class="thumb">${p.media ? `<span class="play" aria-label="${p.media === "video" ? "Video" : "Mix"}">${p.media === "video" ? "▶" : "♫"}</span>` : ""}<img src="${esc(p.cover || FALLBACK)}" alt="" loading="lazy"></div></a>`;
  }
  function feature(p) {
    return `<a class="post-feature reveal" href="/blog/${encodeURIComponent(p.slug)}">
      <div class="img"><img src="${esc(p.cover || FALLBACK)}" alt="${esc(p.title)}"></div>
      <div><span class="eyebrow">Latest</span><h2>${esc(p.title)}</h2><p>${esc(p.excerpt)}</p>
        <div class="post-meta" style="margin-bottom:22px">${p.tag ? `<span class="tag">${esc(p.tag)}</span>` : ""}<span>${fmtDate(p.published_at)}</span><span>· ${p.minutes} min read</span></div>
        <span class="btn">Read post <span class="arrow">→</span></span></div></a>`;
  }

  // Markdown subset. Escapes everything first, so post text can't inject HTML.
  function render(md) {
    const safeUrl = (u) => (/^(https?:\/\/|\/)/i.test(u) ? u : "#");
    const inline = (s) => esc(s)
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, a, u) => `<img src="${safeUrl(u)}" alt="${a}" loading="lazy">`)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => `<a href="${safeUrl(u)}"${/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : ""}>${t}</a>`)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
    // Mixes: SoundCloud, Mixcloud, Spotify links on their own line become players.
    const embedAudio = (s) => {
      const u = s.trim(); if (/\s/.test(u)) return "";
      let m;
      if (/^https:\/\/(www\.|m\.)?soundcloud\.com\/[\w-]+\/[\w-]+/.test(u))
        return `<div class="audio"><iframe height="166" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(u)}&color=%23d6fb51&visual=false" title="SoundCloud" loading="lazy" allow="autoplay"></iframe></div>`;
      if ((m = u.match(/^https:\/\/(?:www\.)?mixcloud\.com(\/[\w-]+\/[\w-]+\/?)/)))
        return `<div class="audio"><iframe height="120" src="https://www.mixcloud.com/widget/iframe/?hide_cover=1&feed=${encodeURIComponent(m[1])}" title="Mixcloud" loading="lazy" allow="autoplay"></iframe></div>`;
      if ((m = u.match(/^https:\/\/open\.spotify\.com\/(track|album|playlist|episode|show)\/(\w+)/)))
        return `<div class="audio"><iframe height="${m[1] === "track" || m[1] === "episode" ? 152 : 352}" src="https://open.spotify.com/embed/${m[1]}/${m[2]}" title="Spotify" loading="lazy" allow="autoplay; encrypted-media"></iframe></div>`;
      return "";
    };
    const yt = (s) => { const m = s.trim().match(/^https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})\S*$/); return m && m[1]; };
    return String(md || "").replace(/\r/g, "").split(/\n{2,}/).map((block) => {
      const b = block.trim(); if (!b) return "";
      const id = yt(b); if (id) return `<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="Video" allowfullscreen loading="lazy"></iframe></div>`;
      const audio = embedAudio(b); if (audio) return audio;
      if (b.startsWith("### ")) return `<h3>${inline(b.slice(4))}</h3>`;
      if (b.startsWith("## ")) return `<h2>${inline(b.slice(3))}</h2>`;
      if (b.startsWith("> ")) return `<blockquote>${inline(b.replace(/^> ?/gm, ""))}</blockquote>`;
      if (/^[-*] /.test(b)) return `<ul>${b.split("\n").map((l) => `<li>${inline(l.replace(/^[-*] /, ""))}</li>`).join("")}</ul>`;
      if (/^!\[[^\]]*\]\([^)]+\)$/.test(b)) return inline(b);
      return `<p>${inline(b).replace(/\n/g, "<br>")}</p>`;
    }).join("");
  }

  async function posts(limit) { return WN.api("/api/posts" + (limit ? "?limit=" + limit : "")); }
  return { row, feature, render, posts, fmtDate, monthYear };
})();
