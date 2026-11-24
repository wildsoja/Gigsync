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
| `/book` | Simple DJ booking form, no prices shown (**send this link to clients**). You get a suggested quote in `/admin` |
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

- **Who gets saved:** every ticket buyer (name, email, phone), everyone who uses the "Notify me" form (plus closest city), DJ booking clients, comp guests and contact-form senders. See them in `/admin` → **Audience**: tickets bought, **events attended** (from door scans), last seen, and list status. Filter, search, export to CSV.
- **Who's on the mailing list:**
  - **Ticket buyers, automatically.** Canada's anti-spam law (CASL) allows emailing customers for 2 years after their last purchase ("implied consent"), and each new purchase restarts the 2 years. Checkout shows one small line, "We'll also send you updates… ☐ No thanks", and only people who tick it are left off.
  - **DJ booking clients** for 6 months after their inquiry (same "No thanks" option on the form).
  - **People who sign up** with the "Notify me" form, with no time limit.
  - Comp guests and contact-form senders are saved but not added to the list.
- **Sending:** `/admin` → Audience → **Send an update**. Write a subject and message, optionally feature an event (flyer + Get tickets button), preview it, send yourself a test, then send to everyone on the list, to sign-ups near Hamilton, Toronto or Niagara, or to **ticket holders of one event** (for things like time or venue changes).
- **Blog alerts:** when you publish a post, tick "Email my mailing list" (on by default for new posts). Video posts go out as "New video: …" with the YouTube thumbnail and a Watch now button, mixes as "New mix: …". Each post is only ever emailed once.
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

- **DJ rate, referral discount, gas price, travel cities:** `public/assets/js/booking-config.js`

### How DJ quotes are worked out (only you see them)
- **Hourly rate by event type:** home/house parties, birthdays and community events $90/hr · club, bar & lounge (paid events) $100/hr · school/prom $110/hr · corporate and festivals $125/hr · weddings $125/hr + $150 planning/timeline/MC prep · "Full event sound & entertainment" is a custom quote you build in admin. Change any of these under `eventTypes`.
- **Referral discount:** 15% off DJ time (in $5 steps). In admin you can set any booking to 0/10/15/20/25%. Discounts never take DJ time below **$75/hr** (`floorRate`) or the area minimum. Club gigs don't get the referral discount.
- **Minimum to leave the house:** $200 in Hamilton, $250 anywhere else. If a request adds up to less, the quote is raised to the minimum (a referral discount can't go below it either).
- **Sound by crowd size** (client picks a guest range): up to 80 guests = 1 speaker (included), 81–150 = 2 speakers +$50, 151–250 = 2 speakers + sub +$100, 250+ = full PA +$150. If the venue has its own sound system, this is skipped.
- **Equipment:** microphones (1 mic +$25, 2 mics +$50), lighting +$50, MC/hosting +$50. Any event type can also carry a flat `extra` (e.g. weddings).
- **What the client sees:** once they pick event type, guests and city, a rough "Estimated price" appears above the Request button (referral discount included), with a note that you confirm the final price. Turn it off with `showEstimate: false`.
- **Where requests go:** each request is emailed to **bookings.soja@gmail.com** (change with `BOOKINGS_EMAIL`), with reply-to set to the client, so hitting Reply answers them. It's also saved in `/admin` → DJ bookings.
- **Deposit:** the confirmation screen and your quote message ask for a $100 deposit by Interac e-Transfer to bookings.soja@gmail.com (`deposit` / `bookingEmail` in the settings file).
- Travel from Hamilton: round-trip km × (gas $1.60/L × 11 L/100 km + 5¢/km wear) ≈ 23¢/km, rounded up to the nearest $5. Toronto areas add $15 for parking/traffic. Hamilton itself is free. Examples: Burlington $10, St. Catharines $25, Niagara Falls $35, downtown Toronto $50. Change `fuelPrice` when gas moves.
- In `/admin` → DJ bookings, each request shows the breakdown and a ready-to-send message. Edit it if you like, then tap **Text quote** or **Email quote**.

### Booking contract & invoice
1. In `/admin` → DJ bookings, open a request and use **Contract & invoice**: set the final hours, rate, discount, travel, deposit, start/end time and up to two custom lines (e.g. "Ceremony audio"). Totals update as you type.
2. **Send contract & invoice** emails the client (copy to the bookings inbox) a link to their booking page: details, invoice `INV-YYYY-####`, deposit instructions (Interac e-Transfer to bookings.soja@gmail.com, invoice number in the message) and the terms.
3. The client types their name and accepts. The signature, time and IP are recorded, and you get an email. The terms they signed are saved with the booking, so later edits to the template don't change signed contracts. Signed contracts are locked.
4. When the e-Transfer arrives, click **Mark deposit received**, then later **Mark paid in full**. The client gets a receipt each time. Their page can be saved as a PDF from the browser.
- **Terms** (deposit, payment, client cancellation, date changes, cancellation by you, overtime, setup/venue needs, equipment & safety, music, meals, photos, events outside anyone's control, liability) are in `lib/contract.js`. The numbers (cancellation window, reschedule notice, setup time, HST) are under `contract` in the settings file. **Have a lawyer review the terms once before relying on them.**
- **HST:** off by default (small suppliers under $30k/yr don't have to register). Once registered, set `hst.registered: true` and your number; 13% is added to invoices.
- **Blog posts & past-event recaps:** write and edit them in `/admin` → Blog. The 9 original recaps are loaded as posts on first run. Posts support headings, **bold**, links, images, pull quotes and YouTube embeds (paste the link on its own line).
- **Contact info / socials:** top of `public/assets/js/site.js`
- **Colours & fonts:** top of `public/assets/css/site.css`
