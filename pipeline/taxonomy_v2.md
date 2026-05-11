# Qubo VOC Taxonomy v2
## Based on prod DB analysis — 54 ASINs, 1,989 reviews across 7 product lines

---

## Why a new taxonomy?

Current taxonomy was designed for cameras only. With 54 ASINs across Cameras,
Dashcams, Smart Locks, Video Doorbells, Auto accessories, and Air Purifiers,
the old taxonomy has gaps:
- "Home Camera Features" is too vague and camera-specific
- "Wi-Fi Setup" and "Wi-Fi Stability" are split but belong together
- No Lock, VDB, Air Purifier, or Dashcam-specific sub_tags
- 441 reviews tagged with empty primary_categories (22% miss rate)

---

## Primary Categories (12 total)

These are the top-level buckets for CXO-facing analysis.
Each covers a distinct customer pain point or delight driver.

### 1. `Product Quality & Reliability`
Hardware build, physical durability, DOA units, overheating, early failures.
**Applies to:** All product lines

Sub-tags:
- Dead on arrival (DOA)
- Stopped working within first month
- Stopped working after 6–12 months (post-warranty)
- Overheating during use
- Physical build feels cheap or flimsy
- Water / weather damage despite outdoor claim
- Camera drifts or faces ceiling after power cut / reset
- Device restarts or hangs randomly
- Durable and reliable over months of use
- Still working well after long-term use
- Lock jams or fails to unlock mechanically
- Smart lock motor fails within warranty period
- Air purifier fan / motor noise or failure

### 2. `Setup & Installation`
Onboarding experience — DIY setup, QR scanning, Qubo installation service.
**Applies to:** All product lines

Sub-tags:
- Easy DIY installation
- Difficult or confusing initial setup
- QR code does not scan during setup
- Professional and clean installation by Qubo technician
- Installer punctual and efficient
- Qubo installation service did not contact / show up
- Installation technician professional and efficient
- Took multiple attempts to complete setup
- Mounting hardware inadequate or missing
- Power cable too short for placement

### 3. `Connectivity & Network`
Wi-Fi pairing, signal stability, reconnection after outages.
**Applies to:** Cameras, VDB, Smart Locks (Wi-Fi models), Air Purifiers

Sub-tags:
- Cannot connect to Wi-Fi at all
- QR code / AP setup fails repeatedly
- Keeps disconnecting from Wi-Fi randomly
- Requires daily manual reset to reconnect
- Needs troubleshooting most times after power cut
- Stable Wi-Fi connection over months
- Works on 2.4 GHz only — not clearly stated in listing
- Weak signal range

### 4. `App & Software Experience`
App performance, UI/UX, multi-device management, remote access, firmware.
**Applies to:** All connected product lines

Sub-tags:
- App smooth and responsive
- App crashes or freezes frequently
- App slow to load
- App UI intuitive and easy to navigate
- Live view lags or buffers
- App manages multiple devices well
- Remote access works reliably
- Firmware update broke functionality
- Stable app with no crashes
- App does not support older Android / iOS versions
- Notifications not received on time

### 5. `Notifications & Alerts`
Alert accuracy, false motion triggers, notification spam, detection sensitivity.
**Applies to:** Cameras, VDB, Smart Locks

Sub-tags:
- Accurate person / motion alerts
- Motion detection too sensitive — too many false alerts
- Notification spam making phone unusable
- No alerts received at all
- Good notification system
- Person / vehicle detection not reliable
- Alert delay is too high (>10 seconds)
- Motion tracking not following subject correctly
- Motion tracking works well

### 6. `Video & Audio Quality`
Image resolution, night vision, audio clarity — for cameras, VDB, dashcams.
**Applies to:** Cameras, VDB, Dashcams

Sub-tags:
- Clear and sharp daytime footage
- Blurry or low resolution
- Poor clarity beyond 10 feet
- Misleading specifications (e.g. 2K resolution claim)
- Excellent night vision
- Good night vision for indoor use
- Night vision range insufficient outdoors
- Colour night vision works well
- Image washed out / overexposed in bright light
- Good two-way talk audio
- Clear audio without wind noise
- Echo or distortion in two-way talk
- Clear footage at night (streetlights, signboards visible)
- Wide angle covers full road width  (dashcam)
- GPS tracking accurate  (dashcam)
- Rear camera quality poor compared to front  (dashcam)

### 7. `Recording & Storage`
Local / cloud recording, SD card reliability, playback, loop recording.
**Applies to:** Cameras, VDB, Dashcams

Sub-tags:
- Loop recording not working
- SD card slot stops detecting card
- SD card as free alternative to cloud appreciated
- Continuous recording without drops
- Recording / timeline navigation confusing
- Easy footage access and download
- Cloud storage mandatory — no local option
- 24/7 recording drains SD card too fast
- Parking mode works reliably  (dashcam)
- Parking mode drains car battery  (dashcam)

### 8. `Smart & Product-Specific Features`
PTZ, 360° coverage, AI tracking, baby/pet/elderly monitoring, smart home.
For locks: fingerprint, PIN, card, app unlock. For purifiers: auto mode, AQI.
**Applies to:** All product lines (product-specific sub-tags)

Sub-tags:
- 360 coverage replaces multiple cameras
- Works well for elderly / baby / pet monitoring
- PTZ control smooth and responsive
- Zoom quality adequate
- Motion tracking works well
- Two-way talk useful for home security
- Fingerprint recognition fast and accurate  (lock)
- Fingerprint fails for wet or rough hands  (lock)
- PIN / passcode entry reliable  (lock)
- Multiple user access (family members) works well  (lock)
- Auto-lock feature works as expected  (lock)
- AQI sensor accurate and responsive  (purifier)
- Auto mode adjusts speed intelligently  (purifier)
- Filter life reasonable  (purifier)
- HEPA filter replacement cost high  (purifier)
- Siren / alarm loud enough  (VDB / lock)

### 9. `Customer Support & After-sales`
Warranty process, service responsiveness, replacement / refund experience.
**Applies to:** All product lines

Sub-tags:
- Support resolved issue quickly
- No response from support team
- Support asks for same videos / proof repeatedly with no resolution
- Refund or replacement refused or delayed
- Warranty claim rejected without valid reason
- Told to buy new product instead of repair / replace
- Escalation to senior support required
- Service centre experience good
- Service centre difficult to find / reach
- Amazon seller support helpful for return

### 10. `Value & Pricing`
Price-value perception, comparison to competitors, subscription costs.
**Applies to:** All product lines

Sub-tags:
- Good value for money
- Overpriced for features offered
- Best in segment at this price point
- Better alternatives at same price (Tapo / IMOU / Mi / CP Plus)
- Features not as advertised
- Subscription cost not justified by features
- Hardware price reasonable, but cloud storage cost high

### 11. `Subscription & Paywall`
Features locked behind paid plans, unexpected paywalls, cloud plan pricing.
**Applies to:** Cameras, VDB (any with cloud subscription)

Sub-tags:
- Features locked behind subscription unexpectedly
- Free tier too limited for practical use
- Cloud plan pricing reasonable
- Subscription auto-renewed without clear notice
- SD card as free alternative to cloud appreciated  (cross-ref with Recording)

### 12. `Delivery & Packaging`
Physical delivery condition, missing accessories, packaging quality.
**Applies to:** All product lines

Sub-tags:
- Product arrived damaged
- Missing accessories in box (mount, screws, cable)
- Packaging sturdy and well-protected
- Delivery faster than expected
- Wrong product / variant sent

---

## Mapping: product line → most relevant primary categories

| Product Line     | Top Categories                                                                 |
|------------------|--------------------------------------------------------------------------------|
| Camera           | Video & Audio Quality, Smart Features, Recording & Storage, Connectivity       |
| Dashcam          | Video & Audio Quality, Recording & Storage, Smart Features (GPS/parking)       |
| Smart Lock       | Smart Features (biometric/PIN), Product Reliability, Setup & Installation      |
| Video Doorbell   | Video & Audio Quality, Notifications & Alerts, Connectivity, Smart Features    |
| Air Purifier     | Smart Features (AQI/auto), Product Reliability, App & Software                 |
| Auto             | Product Quality & Reliability, Value & Pricing                                 |

---

## Changes from current taxonomy

| Old                          | New / Action                                            |
|------------------------------|---------------------------------------------------------|
| `Home Camera Features`       | → `Smart & Product-Specific Features` (broader)        |
| `Wi-Fi Setup`                | → merged into `Connectivity & Network`                 |
| `Wi-Fi Stability`            | → merged into `Connectivity & Network`                 |
| `Dashcam Features`           | → sub-tags under `Smart & Product-Specific Features`   |
| `False / Excessive Alerts`   | → merged into `Notifications & Alerts`                 |
| `Overheating`                | → sub-tag under `Product Quality & Reliability`        |
| `Audio Quality`              | → sub-tags under `Video & Audio Quality`               |
| `Subscription & Paywall`     | kept as standalone (enough volume to warrant)          |
| (missing)                    | + `Delivery & Packaging` added                         |
| (missing)                    | + lock / purifier / dashcam-specific sub-tags added    |

---

## Tagger system prompt (replace in tagger.py)

```
You are a VOC (Voice of Customer) analyst for Qubo by Hero Electronix.
Qubo sells security cameras, dashcams, smart locks, video doorbells, auto
accessories, and air purifiers on Amazon India.

Classify each review into 1–3 primary categories from this fixed list:
  Product Quality & Reliability
  Setup & Installation
  Connectivity & Network
  App & Software Experience
  Notifications & Alerts
  Video & Audio Quality
  Recording & Storage
  Smart & Product-Specific Features
  Customer Support & After-sales
  Value & Pricing
  Subscription & Paywall
  Delivery & Packaging

Also extract 0–5 specific sub_tags that are short, factual observations
(e.g. "Dead on arrival (DOA)", "Excellent night vision",
"Fingerprint fails for wet or rough hands"). Sub-tags must be concrete
observations, not paraphrases of the category name.

Return ONLY valid JSON, no markdown fences, no extra keys:
[
  {
    "id": "<review_id>",
    "sentiment": "Positive" | "Negative" | "Neutral",
    "primary_categories": ["<cat1>", "<cat2>"],
    "sub_tags": ["<tag1>", "<tag2>"]
  },
  ...
]
```

---

## Implementation notes

1. Update `pipeline/tagger.py` — replace the category list and system prompt
2. Re-tag all existing reviews with `python tagger.py --retag-all` (add this flag)
3. Dashboard filter labels will auto-update since they read from the DB dynamically
4. Consider adding a `product_line` column to `raw_reviews` derived from `category`
   field to enable product-line-level filtering without relying on product name matching
