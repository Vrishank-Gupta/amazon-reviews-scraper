# taxonomy.py
#
# VOC taxonomy for Qubo (Hero Electronix) — Cam360 3MP & Dashcam ProX
# Built from analysis of 243 actual Amazon.in reviews (Feb–Mar 2026).
#
# Design principles:
#   - Every category maps to a clear business owner (Product / App / CX / Ops)
#   - Sub-tags are specific enough to drive R&D and CX decisions
#   - Negative and positive sub-tags coexist so the same taxonomy scores both
#   - Cam360 and Dashcam ProX share the core taxonomy; product-specific issues
#     are captured in dedicated categories at the bottom
#
# KEY CHANGES from previous version:
#   - "Hardware Issues" + "Hardware & Build Quality" merged → "Hardware Reliability"
#   - "App Issues" + "App & Software" merged → "App Performance" + "App Features" (split by type)
#   - "Customer Support" + "Service Issues" merged → "Customer Support & Service"
#   - "Connectivity & Setup" split into "Wi-Fi Setup" vs "Wi-Fi Stability" (different root causes / owners)
#   - "Video & Image Quality" split into Daytime / Night / Audio (different hardware owners)
#   - NEW: "Overheating" — dashcam thermal shutdown is safety-critical (missed accident footage)
#   - NEW: "False / Excessive Alerts" — firmware-triggered alert floods on Cam360
#   - NEW: "Subscription & Paywall" — multi-user / cloud cost complaints emerging
#   - NEW: "Windshield Glare" — dashcam optical gap, needs CPL filter (not included)
#   - NEW: "Recording Reliability" — hardware-level recording failure distinct from app bugs


TAXONOMY = {

    # ── VIDEO QUALITY — DAYTIME ──────────────────────────────────────────────
    # Owner: Hardware / Optics team
    # Signal: clarity complaints, resolution vs advertised, competitor comparisons
    "Video Quality — Daytime": [
        "Blurry or low resolution (not matching advertised spec)",
        "Faces or number plates not readable",
        "Poor clarity beyond 10 feet",
        "Colour accuracy / washed out footage",
        "Wide angle distortion",
        "Rear camera blurry (dashcam)",
        "Clear and sharp daytime footage",
        "Number plates clearly visible",
        "Wide angle covers full road / room",
    ],

    # ── VIDEO QUALITY — NIGHT & LOW LIGHT ───────────────────────────────────
    # Owner: Hardware / Optics team
    "Video Quality — Night & Low Light": [
        "Poor night vision",
        "IR overexposure or washed out at night",
        "Cannot see faces or details at night",
        "Excellent night vision",
        "Clear footage at night (streetlights, signboards visible)",
        "Balanced IR without overexposure",
    ],

    # ── AUDIO QUALITY ────────────────────────────────────────────────────────
    # Owner: Hardware team
    # Note: audio-video sync lag found in Cam360 reviews; wind noise in Dashcam ProX
    "Audio Quality": [
        "Audio-video sync issue (audio ahead of video)",
        "Speaker too weak or inaudible",
        "Cannot hear clearly in two-way talk",
        "Wind noise overpowers audio (dashcam)",
        "Microphone not picking up sound",
        "Good two-way talk audio",
        "Clear audio without wind noise",
        "Audible siren / alarm",
    ],

    # ── APP PERFORMANCE ──────────────────────────────────────────────────────
    # Owner: App / Software team
    # Signal: stability, speed, live view reliability
    # Note: live view lag is the #1 app complaint across both products
    "App Performance": [
        "App crashes or freezes frequently",
        "Live view lags or buffers",
        "App slow to load",
        "App closes on its own",
        "Footage playback freezes or unavailable",
        "App smooth and responsive",
        "Live view loads quickly",
        "Stable app with no crashes",
    ],

    # ── APP FEATURES ─────────────────────────────────────────────────────────
    # Owner: Product / App team
    # Note: recording UI confusion, multi-user paywall, watermark removal are real documented gaps
    "App Features": [
        "Recording / timeline navigation confusing",
        "Cannot split or trim recordings in app",
        "Qubo watermark cannot be removed from footage",
        "Multi-user access requires paid subscription",
        "Auto-recording feature not activating",
        "Notifications not working or delayed",
        "Wrong timestamp on recordings",
        "App UI intuitive and easy to navigate",
        "Good notification system",
        "Easy footage access and download",
        "App manages multiple devices well",
    ],

    # ── WI-FI SETUP (FIRST-TIME PAIRING) ────────────────────────────────────
    # Owner: Firmware / Onboarding team
    # Signal: one-time failures at install — QR scan, initial pairing, router compatibility
    # SEPARATE from Wi-Fi Stability — setup failures are onboarding bugs, instability is firmware
    "Wi-Fi Setup": [
        "QR code does not scan during setup",
        "Cannot connect to Wi-Fi at all",
        "Only supports 2.4GHz — incompatible with Jio / Airtel 5G-only routers",
        "Not compatible with mesh Wi-Fi networks",
        "Setup instructions unclear or missing",
        "Difficult first-time setup",
        "Quick and easy first-time setup",
        "QR scan worked smoothly",
        "Works on mesh / dual-band router",
    ],

    # ── WI-FI STABILITY (POST-SETUP DROPS) ──────────────────────────────────
    # Owner: Firmware team
    # Note: multiple Cam360 reviews describe disconnecting even with router beside camera
    #       Different root cause from setup failures — ongoing firmware / keepalive issue
    "Wi-Fi Stability": [
        "Keeps disconnecting from Wi-Fi randomly",
        "Camera goes offline silently (no alert)",
        "Requires daily manual reset to reconnect",
        "Needs troubleshooting most times after power cut",
        "Stable Wi-Fi connection over months",
        "No unexpected disconnects",
        "Reconnects automatically after power outage",
    ],

    # ── HARDWARE RELIABILITY ─────────────────────────────────────────────────
    # Owner: Hardware / Manufacturing / QC
    # Note: merged from old "Hardware Issues" + "Hardware & Build Quality"
    "Hardware Reliability": [
        "Dead on arrival (DOA)",
        "Stopped working within first month",
        "Stopped working after 6–12 months (post-warranty)",
        "SD card slot stops detecting card",
        "Camera does not power on",
        "Device restarts or hangs randomly",
        "Missing component in box",
        "Physical noise while rotating (Cam360 motor)",
        "Durable and reliable over months of use",
        "Still working well after long-term use",
    ],

    # ── OVERHEATING ──────────────────────────────────────────────────────────
    # Owner: Hardware / Thermal engineering — SAFETY CRITICAL for dashcam
    # Note: NEW — dashcam shuts off in 40-48°C Indian summer conditions
    #       One review explicitly states dashcam missed accident footage due to thermal shutdown
    "Overheating": [
        "Dashcam shuts off in direct sunlight",
        "Stops working in Indian summer heat (40°C+)",
        "Cannot be powered on with button when overheated",
        "Thermal shutdown caused missed recording at critical moment",
        "Video hangs or freezes when device is hot",
        "Handles Indian heat well",
        "No overheating issues after long drives",
    ],

    # ── RECORDING RELIABILITY ────────────────────────────────────────────────
    # Owner: Firmware / Hardware team
    # Note: hardware-level recording failure — distinct from app performance bugs
    #       Dashcam-weighted but applies to Cam360 continuous recording too
    "Recording Reliability": [
        "Recording pauses or stops mid-drive",
        "Frozen frames in footage",
        "Loop recording not working",
        "G-sensor / emergency recording fails",
        "SD card reformats itself repeatedly",
        "Footage missing at critical moments",
        "Continuous recording without drops",
        "Loop recording works correctly",
        "Emergency recording captured incident successfully",
    ],

    # ── FALSE / EXCESSIVE ALERTS ─────────────────────────────────────────────
    # Owner: AI / Firmware team
    # Note: NEW — firmware update on Cam360 triggered constant false alerts every second
    #       Motion sensitivity is a separate issue from app crashes or detection not triggering
    "False / Excessive Alerts": [
        "Alerts triggered constantly with nothing in frame",
        "Motion detection too sensitive",
        "False person detection",
        "Alert flood after firmware update",
        "Notification spam making phone unusable",
        "Motion detection well-calibrated",
        "Accurate person / motion alerts",
        "Alert frequency is appropriate",
    ],

    # ── CUSTOMER SUPPORT & SERVICE ───────────────────────────────────────────
    # Owner: CX / After-sales team
    # Note: merged "Customer Support" + "Service Issues" — same business function
    #       Consistently highest-volume negative theme; support runaround documented in detail
    "Customer Support & Service": [
        "No response from support team",
        "Support asks for same videos / proof repeatedly with no resolution",
        "Told to buy new product instead of repair / replace",
        "Warranty claim rejected without valid reason",
        "Refund or replacement refused or delayed",
        "Service centre not available outside metro cities",
        "Paid for third-party repair because Qubo refused warranty",
        "Support resolved issue quickly",
        "Replacement delivered within 3–4 days",
        "Installation technician professional and efficient",
    ],

    # ── INSTALLATION EXPERIENCE ──────────────────────────────────────────────
    # Owner: Operations / Installation partner management
    # Note: Dashcam ProX has paid Qubo installation — technician quality is inconsistent
    #       Cam360 is DIY — complaints are about missing accessories / unclear guide
    "Installation Experience": [
        "Hardwire kit not included (extra purchase required)",
        "Installer did not know the product",
        "Had to pay twice for installation",
        "Qubo installation service did not contact / show up",
        "Amazon free installation offer did not materialise",
        "Missing wall mount or drill accessories",
        "Easy DIY installation",
        "Professional and clean installation by Qubo technician",
        "Installer punctual and efficient",
        "Installation completed quickly without damage to car",
    ],

    # ── WINDSHIELD GLARE ─────────────────────────────────────────────────────
    # Owner: Hardware / Optics (Dashcam ProX specific)
    # Note: NEW — multiple dashcam reviews mention needing a CPL filter for clear footage
    #       This is a product design gap: CPL not included, not mentioned in product listing
    "Windshield Glare": [
        "Reflections and glare visible in footage",
        "Bright sunlight causes glare across entire video",
        "Needs CPL filter for usable footage (not included in box)",
        "Night headlights cause significant lens flare",
        "No glare or reflection issues",
        "Clear footage in high-contrast lighting conditions",
    ],

    # ── DASHCAM FEATURES ─────────────────────────────────────────────────────
    # Owner: Product team — Automotive vertical
    "Dashcam Features": [
        "No GPS or speed overlay",
        "GPS inaccurate or not updating",
        "Parking mode missing or not functional",
        "Rear camera not syncing with front",
        "Qubo logo / watermark cannot be removed from video",
        "Received old manufacturing date stock",
        "Super capacitor (no battery degradation) appreciated",
        "GPS tracking accurate",
        "Parking mode reliable",
        "Wide angle covers full road width",
    ],

    # ── HOME CAMERA FEATURES ─────────────────────────────────────────────────
    # Owner: Product team — Home Security vertical
    "Home Camera Features": [
        "360 pan / tilt motor making noise while rotating",
        "Camera drifts or faces ceiling after power cut / reset",
        "Motion tracking not following subject correctly",
        "Two-way talk delay or echo",
        "Siren alarm too quiet",
        "Privacy mode not working",
        "2.4GHz only — incompatible with modern mesh / 5G routers",
        "360 coverage replaces multiple cameras",
        "Motion tracking works well",
        "Two-way talk clear and real-time",
        "Works well for elderly / baby / pet monitoring",
        "Good night vision for indoor use",
    ],

    # ── SUBSCRIPTION & PAYWALL ───────────────────────────────────────────────
    # Owner: Business / Product team
    # Note: NEW — multi-user access paywall appearing in reviews; small signal now, will grow
    "Subscription & Paywall": [
        "More than 2 simultaneous users requires paid plan",
        "Cloud storage too expensive",
        "Features locked behind subscription unexpectedly",
        "SD card as free alternative to cloud appreciated",
        "Cloud storage pricing reasonable",
    ],

    # ── PRODUCT VALUE & COMPETITION ──────────────────────────────────────────
    # Owner: Product / Marketing
    # Signal: direct competitor mentions (Tapo, IMOU, Mi, CP Plus, Philips, 7MI)
    "Product Value & Competition": [
        "Overpriced for features offered",
        "Better alternatives at same price (Tapo / IMOU / Mi / CP Plus)",
        "Features not as advertised",
        "Misleading specifications (e.g. 2K resolution claim)",
        "Cheaper on Qubo website than Amazon",
        "Good value for money",
        "Best in segment at this price point",
        "Switched from competitor and satisfied",
    ],

    # ── DELIVERY & PACKAGING ─────────────────────────────────────────────────
    # Owner: Supply chain / Fulfilment
    "Delivery & Packaging": [
        "Broken seal on delivery",
        "Damaged product on arrival",
        "Wrong product delivered",
        "Missing items in package",
        "Fast delivery",
        "Well-packaged and protected",
    ],

}