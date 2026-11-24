# Wild Soja / Wild Nation booking site

A static website for DJ Wild Soja and Wild Nation Events. It has a landing page and a booking
form that shows clients a live price estimate as they fill it in, then sends you the request.

- `index.html`: landing page (services, how it works, call to action)
- `book.html`: booking form + live quote. **This is the link you send clients.**
- `assets/config.js`: **all your prices, add-ons, contact info and form settings. Edit this file.**
- `assets/pricing.js`: the pricing math
- `assets/book.js`: form behavior (validation, saving drafts, submitting)

## 1. Set your prices
Open `assets/config.js` and change the numbers:

| Setting | What it does |
|---|---|
| `eventTypes` | Base price per event type (covers `includedHours`) and the hourly rate for extra time |
| `guestTiers` | Extra charge for bigger crowds |
| `addOns` | Sound, lighting, MC, sparks, etc. Add, remove or rename freely |
| `travelZones` | Travel fees by distance. `add: null` means "custom quote" |
| `surcharges` | Friday/Saturday %, short-notice %, holiday dates % |
| `depositPercent` | Deposit shown to the client |

How a quote is calculated: base price + extra hours + crowd size + add-ons + travel, then
weekend/holiday and short-notice percentages are added on top of that.

## 2. Decide how requests reach you
In `assets/config.js`:
- Set `brand.email` to your booking email.
- **Recommended:** create a free form at [formspree.io](https://formspree.io), copy its URL
  (looks like `https://formspree.io/f/abcdwxyz`) into `formEndpoint`. Every request lands in your
  inbox with the full breakdown and a reference number like `WN-261124-AB12`.
- If `formEndpoint` is left empty, the form opens the client's email app with everything
  pre-filled to your email. Works, but the client has to hit send.

## 3. Put it online (free)
- **GitHub Pages:** repo Settings → Pages → deploy from branch → root. Your link will be
  `https://<username>.github.io/<repo>/book.html`.
- **Netlify:** drag the folder into app.netlify.com/drop. You can attach a custom domain like
  `book.wildnation.com`.

## Pre-filled client links
You can send links with details already filled in:
- `book.html?type=wedding`
- `book.html?type=corporate&guests=250&travel=near`
- `book.html?type=private&addOns=sound,lighting`

Event type keys: `wedding, corporate, private, birthday, school, club, festival, other`.
