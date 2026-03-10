# taxonomy.py
#
# CXO-grade VOC taxonomy for Qubo (Hero Electronix) smart IoT product portfolio.
# Products covered: Dashcams, Smart Cameras (360/Bullet/Indoor/Outdoor),
#                   Video Doorbells, Smart Door Locks, GPS Trackers,
#                   Smart Home ecosystem (lights, purifiers, etc.)
#
# Design principles:
#   - Categories map to business functions (Product, App, Support, Ops)
#   - Sub-tags are specific enough to drive R&D, CX, and ops decisions
#   - Covers both Automotive (dashcam) and Home Security verticals
#   - Includes positive signal tags to capture what is working

TAXONOMY = {

    # ── VIDEO & IMAGE QUALITY ────────────────────────────────────────────────
    # Core product promise: "see clearly, day and night"
    "Video & Image Quality": [
        "Poor daytime video quality",
        "Poor night vision / NightPulse issues",
        "Blurry or low resolution footage",
        "Jello / wobble effect in video",
        "Number plate not readable",
        "Colour accuracy issues",
        "Wide angle distortion",
        "IR overexposure at night",
        "Good video quality",
        "Excellent night vision",
    ],

    # ── APP & SOFTWARE ───────────────────────────────────────────────────────
    # Qubo app is the single pane of glass across all products
    "App & Software": [
        "App crash or freeze",
        "App slow to load / laggy",
        "Live view lag or buffering",
        "Notifications not working",
        "Motion / person detection not triggering",
        "AI detection false positives",
        "Footage playback / timeline navigation issues",
        "App-device pairing failure",
        "App-device disconnects frequently",
        "Android Auto / CarPlay conflict",
        "Wrong timestamp on recordings",
        "Login / account issues",
        "App UI difficult to use",
        "App works seamlessly",
        "Good notification system",
    ],

    # ── CONNECTIVITY & SETUP ─────────────────────────────────────────────────
    "Connectivity & Setup": [
        "Wi-Fi pairing failure",
        "Drops Wi-Fi connection frequently",
        "Only supports 2.4GHz (no 5GHz)",
        "Bluetooth pairing issues",
        "Requires frequent re-pairing or reset",
        "Difficult first-time setup",
        "Setup instructions unclear",
        "Easy to set up",
        "Stable Wi-Fi connection",
    ],

    # ── HARDWARE & BUILD QUALITY ─────────────────────────────────────────────
    "Hardware & Build Quality": [
        "Device dead on arrival (DOA)",
        "Device stopped working (early failure)",
        "Overheating in Indian summer",
        "Mount or adhesive falls off",
        "Camera housing damage",
        "Microphone not working",
        "Speaker / two-way talk issue",
        "Power cable or connector issue",
        "Device restarts or hangs randomly",
        "SD card slot not reading card",
        "Weatherproofing failure",
        "Sturdy build quality",
        "Heat management good",
    ],

    # ── STORAGE & CLOUD ──────────────────────────────────────────────────────
    "Storage & Cloud": [
        "SD card not detected or unsupported",
        "SD card corrupts data",
        "Loop recording not working",
        "Cloud subscription issues",
        "Cloud storage too expensive",
        "AI alerts not reaching cloud",
        "Cannot access footage remotely",
        "Data privacy concern",
        "Large SD card support appreciated",
        "Indian cloud storage appreciated",
    ],

    # ── AI FEATURES ──────────────────────────────────────────────────────────
    # Qubo's core differentiator across all products
    "AI Features": [
        "Person detection unreliable",
        "ADAS alerts inaccurate",
        "Face recognition not working",
        "Baby cry alert not working",
        "Intruder siren alarm issue",
        "AI alerts delayed",
        "Visitor log inaccurate",
        "Too many false alerts",
        "AI person detection works well",
        "ADAS useful on Indian roads",
    ],

    # ── INSTALLATION & ACCESSORIES ───────────────────────────────────────────
    "Installation & Accessories": [
        "Difficult to install",
        "Missing accessories in box",
        "Incompatible mount for vehicle or wall",
        "Cable too short or too long",
        "No professional installation support",
        "Easy DIY installation",
        "Good accessories included",
    ],

    # ── CUSTOMER SUPPORT & SERVICE ───────────────────────────────────────────
    # Consistently the #1 negative theme across all Qubo products
    "Customer Support & Service": [
        "No response from support",
        "Extremely slow resolution",
        "Support repeating same tests with no escalation",
        "WhatsApp support disconnected or unhelpful",
        "Replacement or refund refused",
        "Warranty claim rejected",
        "Service centre not available nearby",
        "Support resolved issue quickly",
        "Proactive follow-up by support",
    ],

    # ── PRODUCT VALUE & PRICING ──────────────────────────────────────────────
    "Product Value & Pricing": [
        "Overpriced for features offered",
        "Better alternatives at same price",
        "Features not as advertised",
        "Misleading specifications",
        "Good value for money",
        "Best in segment at this price",
        "Made in India trust factor",
    ],

    # ── DELIVERY & PACKAGING ─────────────────────────────────────────────────
    "Delivery & Packaging": [
        "Damaged or broken on arrival",
        "Wrong product delivered",
        "Missing items in package",
        "Packaging not protective enough",
        "Fast delivery",
        "Good packaging",
    ],

    # ── DASHCAM & AUTO FEATURES ──────────────────────────────────────────────
    # Automotive vertical: dashcams, GPS trackers, rear cams
    "Dashcam & Auto Features": [
        "Parking mode not working",
        "GPS tracking inaccurate or missing",
        "Emergency or G-sensor recording failure",
        "Rear camera sync issues",
        "Video files incompatible with media players",
        "No cloud storage for dashcam footage",
        "No alert when dashcam powers off",
        "Conflict with Android Auto or CarPlay",
        "Journey time-lapse appreciated",
        "Good GPS tracking",
        "Reliable parking mode",
    ],

    # ── HOME SECURITY FEATURES ───────────────────────────────────────────────
    # Cameras, doorbells, smart locks
    "Home Security Features": [
        "Doorbell video call too slow",
        "Two-way talk audio lag or echo",
        "Motion zone customisation missing",
        "Privacy mode not working",
        "Smart door lock pairing issue",
        "Door lock battery drains fast",
        "Doorbell chime customisation missing",
        "360 pan or tilt motor issues",
        "Siren alarm too low volume",
        "Continuous recording unstable",
        "Doorbell works reliably",
        "Smart lock easy to use",
        "360 coverage excellent",
    ],

    # ── ECOSYSTEM & INTEGRATIONS ─────────────────────────────────────────────
    "Ecosystem & Integrations": [
        "Alexa integration not working",
        "Google Home integration issues",
        "Multi-device management cumbersome",
        "No API or developer access",
        "Subscription paywall frustration",
        "Single app for all devices appreciated",
        "Alexa voice control works well",
        "Google Home integration seamless",
    ],

    # ── FEATURE REQUESTS ─────────────────────────────────────────────────────
    # Forward-looking signal for product roadmap
    "Feature Requests": [
        "Request: 5GHz Wi-Fi support",
        "Request: better cloud storage pricing",
        "Request: API or RTSP stream access",
        "Request: customisable chime tones",
        "Request: local NVR or NAS support",
        "Request: offline mode when internet is down",
        "Request: wireless rear dashcam",
        "Request: longer warranty",
        "Request: dark mode in app",
        "Request: improved face recognition",
    ],
}