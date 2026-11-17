# Venue Location Check (Geofence)

Optionally require that every vote comes from a phone located inside the venue.

## How it works

1. The admin sets the venue center (latitude/longitude), a radius, and a maximum
   accepted GPS error in **Admin Panel → Venue Location Check**.
2. When a voter taps **Submit Vote**, the page asks the browser for its current
   position and sends it with the vote.
3. The server (`server/src/geofence/require-venue-presence.mjs`) rejects the vote
   with `403` if:
   - `LOCATION_REQUIRED`: no or malformed location was sent
   - `LOCATION_INACCURATE`: the phone's reported accuracy is worse than the max GPS error
   - `OUTSIDE_VENUE`: the position is farther than the radius from the center
   - `GEOFENCE_NOT_CONFIGURED`: enabled without coordinates (fails closed)
4. For accepted votes, only the **distance from the center** and the **reported accuracy**
   are stored on the vote (`voters.votes.<teamId>.distanceMeters/accuracyMeters`).
   Raw coordinates are never stored.

The check runs on **every vote**, not at registration, so someone who registers
inside the room and then leaves cannot keep voting.

It is **off by default**; nothing changes until an admin enables it.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/geofence` | public | `{ enabled, maxAccuracyMeters }` (no coordinates exposed) |
| GET | `/api/admin/geofence` | admin | Full settings |
| PUT | `/api/admin/geofence` | admin | Update `enabled`, `latitude`, `longitude`, `radiusMeters` (10–5000), `maxAccuracyMeters` (10–5000) |

`POST /api/vote/:id` now accepts an optional `location: { latitude, longitude, accuracy }`.

## Setting it up on event day

1. Stand in the **middle of the auditorium**, open the admin panel on a phone,
   tap **Use my current location**, and wait for a good fix (low ± value).
2. Start with a **generous radius (150–200 m)** and max GPS error **~200 m**. Indoor
   positioning is often off by 20–100 m; too strict a radius rejects real voters.
3. Do a test vote from the back row and near the walls before enabling it for real.
4. Keep the **Disable** button at hand: if many voters get rejected, switch it off.
   Voters' pages read the setting at submit time, so the change takes effect within ~5 s.

## Requirements and limits

- The site must be served over **HTTPS**. Browsers refuse location on plain HTTP.
- Voters must allow location access (and on iPhone, Location Services for the browser).
- **Location is reported by the phone and can be spoofed** (mock-location apps, browser
  devtools, direct API calls). This raises the bar against casual remote voting
  (a photo of the code sent to a friend), but it is not proof of presence. For stronger
  guarantees, combine it with an entrance check-in.
