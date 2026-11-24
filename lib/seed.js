// Creates one clearly-labelled sample event on first run so the site isn't empty.
// Edit or delete it from /admin.
const { q } = require("./db");

function seedIfEmpty() {
  if (q.get("SELECT COUNT(*) n FROM events").n > 0) return;
  const d = new Date(Date.now() + 30 * 864e5);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7)); // next Saturday after +30 days
  const day = d.toISOString().slice(0, 10);
  const id = Number(q.run(
    `INSERT INTO events (slug, title, tagline, description, starts_at, ends_at, venue, address, city, age, dress_code, flyer, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'published')`,
    "sample-night", "Sample Night",
    "Sample event: edit or delete me in /admin",
    "This is a sample event so you can see how event pages and checkout look.\n\nSign in at /admin to change the title, date, flyer and ticket prices, or delete it and create your own.",
    `${day}T22:00`, "", "Venue TBA", "", "Toronto, ON", "19+", "Dress to impress", "/img/last-dance.webp"
  ).lastInsertRowid);
  const tiers = [
    ["Early Bird", "Limited first release", 2500, 50, 0],
    ["General Admission", "Standard entry", 3500, 200, 1],
    ["VIP Booth (6 people)", "Reserved booth + bottle service, entry for 6", 45000, 6, 2],
  ];
  for (const [name, desc, price, qty, sort] of tiers)
    q.run(`INSERT INTO ticket_types (event_id, name, description, price_cents, quantity, max_per_order, sort) VALUES (?,?,?,?,?,?,?)`,
      id, name, desc, price, qty, name.startsWith("VIP") ? 1 : 10, sort);
  console.log("Seeded sample event (/event/sample-night)");
}
// Past-event recaps from the original site become the first blog posts.
function seedPosts() {
  if (q.get("SELECT COUNT(*) n FROM posts").n > 0) return;
  for (const r of require("./recaps-seed.json"))
    q.run(`INSERT INTO posts (slug, title, excerpt, body, cover, tag, published_at, status, notified_at) VALUES (?,?,?,?,?,?,?, 'published', datetime('now'))`,
      r.slug, r.title, "", r.body, r.cover, r.tag, r.date);
  console.log("Seeded blog with past-event recaps");
}
module.exports = { seedIfEmpty, seedPosts };
