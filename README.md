# Wild Nation

Website, DJ booking quotes and a built-in ticketing system for **Wild Nation Events** and **DJ Wild Soja**.

| Page | What it does |
|---|---|
| `/` | Home: layered parallax hero, "Still not sold?" scroll sequence, upcoming events, past-event archive, Wild Soja promo, mailing list |
| `/events` | All upcoming events, recaps of past parties, FAQ |
| `/event/<name>` | Event page with ticket types and checkout |
| `/order/<id>` | Order confirmation with every ticket's QR code |
| `/t/<ticket>` | A single ticket (what the QR code opens). Share it with a friend |
| `/blog` | Blog in a list layout: latest post featured, then dated rows with filters by city |
| `/blog/<post>` | A single post |
| `/wildsoja` | DJ page with services and prices |
| `/book` | DJ booking form with a live price estimate (**send this link to clients**) |
| `/contact` | Contact form |
| `/admin` | Your dashboard: events, ticket sales, attendees, comp tickets, DJ bookings, audience & email updates, blog posts, messages |
| `/admin/scan` | Door scanner. Open on a phone, point the camera at tickets |

## How ticketing works

1. In `/admin`, create an event: flyer, date, venue and ticket types (e.g. Early Bird $25 × 50, GA $35 × 200, VIP Booth $450 × 6). Each type can have its own sale start/end times and per-order limit. Set status to **Published**.
2. Buyers pick tickets and pay with **Stripe** (card, Apple Pay, Google Pay). Tickets are held for 20 minutes during checkout, so nothing oversells.
3. Each ticket gets a unique, cryptographically signed QR code. Buyers see their tickets on screen and get them by email.
4. At the door, open `/admin/scan` on any phone. Green = welcome in, yellow = already scanned, red = invalid, cancelled or wrong event. You can also type a code by hand.
5. Watch sales and check-ins live in `/admin`. Export attendees to CSV, resend tickets, cancel orders, or send free **comp tickets** for guest list and performers.

**Test mode:** until you add a Stripe key, checkout issues real tickets without taking payment, and the site shows a "test mode" banner. Use this to try everything end to end.

## Mailing list & updates

- **Who gets saved:** everyone who uses the "Notify me" form (name, email, phone, closest city), every ticket buyer, DJ booking clients and contact-form senders. See them all in `/admin` → **Audience**, filter and search, and export to CSV.
- **Who gets updates:** only people who opted in, via the sign-up form or the "send me updates" box at checkout and on the booking form. The box starts unticked, as Canada's anti-spam law (CASL) requires.
- **Sending:** `/admin` → Audience → **Send an update**. Write a subject and message, optionally feature an event (flyer + Get tickets button), preview it, send yourself a test, then send to everyone subscribed, to subscribers near Hamilton, Toronto or Niagara, or to **ticket holders of one event** (for things like time or venue changes).
- Every email has an unsubscribe link. Unsubscribed people are never emailed again unless they sign up again.
- CASL also asks for a mailing address in marketing emails: set `BUSINESS_ADDRESS` and it's added to the footer.
- **Volume:** Gmail allows about 500 emails a day. For a bigger list, use an email provider such as Brevo, Resend or Amazon SES (just change the SMTP settings).

## Run it locally

Requires Node.js 22.13+.

```bash
npm install
ADMIN_PASSWORD=pick-one npm start      # http://localhost:3000, admin at /admin
npm test                               # automated tests
```

A clearly labelled **Sample Night** event is created on first run. Edit or delete it in `/admin`.

## Go live

1. **Host it** anywhere that runs Node and has a persistent disk (the database and uploaded flyers live in `DATA_DIR`):
   - **Render:** connect this repo. `render.yaml` sets everything up, including a 1 GB disk.
   - **Railway / Fly.io:** use the `Dockerfile` and mount a volume at `/data`.
2. **Set environment variables** (see `.env.example`): `ADMIN_PASSWORD` and `BASE_URL` at minimum.
3. **Stripe:** create an account at stripe.com and add `STRIPE_SECRET_KEY`. Then add a webhook (Developers → Webhooks) pointing to `https://YOUR-SITE/api/stripe/webhook` for the events `checkout.session.completed` and `checkout.session.expired`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Do refunds in the Stripe dashboard, then cancel the order in `/admin` so its tickets stop working.
4. **Email:** add SMTP settings so tickets get emailed. For Gmail, create an *app password* (Google Account → Security → App passwords). Set `OWNER_EMAIL` to get notified of every sale, booking and message.
5. **Domain:** point your domain at the host and set `BASE_URL` to it.

Back up `DATA_DIR` (`wildnation.db`, `secret.key`, `uploads/`). If `secret.key` is lost, existing QR codes stop scanning.

## Change things

- **DJ prices, add-ons, travel fees, deposit:** `public/assets/js/booking-config.js`
- **Blog posts & past-event recaps:** write and edit them in `/admin` → Blog. The 9 original recaps are loaded as posts on first run. Posts support headings, **bold**, links, images, pull quotes and YouTube embeds (paste the link on its own line).
- **Contact info / socials:** top of `public/assets/js/site.js`
- **Colours & fonts:** top of `public/assets/css/site.css`
