/* Past-event tiles (home archive rail, events page). Pulled from the blog, so new posts show up automatically. */
window.WN_renderRecaps = async function (el, { limit } = {}) {
  let posts = [];
  try { posts = await WN.api("/api/posts" + (limit ? "?limit=" + limit : "")); } catch (e) {}
  if (!posts.length) { el.closest("section").hidden = true; return; }
  el.innerHTML = posts.map((p) => {
    const when = new Date(p.published_at + "T12:00:00").toLocaleDateString("en-CA", { month: "short", year: "numeric" }).replace(".", "");
    return `<a class="recap reveal" href="/blog/${encodeURIComponent(p.slug)}" style="text-decoration:none">
      <img src="${WN.esc(p.cover || "img/hero/bg.webp")}" alt="${WN.esc(p.title)}" loading="lazy">
      <span class="cap"><small>${WN.esc([p.tag, when].filter(Boolean).join(" · "))}</small><b>${WN.esc(p.title)}</b></span></a>`;
  }).join("");
  WN.reveal(el);
};
