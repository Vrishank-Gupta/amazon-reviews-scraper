# We are building a taxonomy of common themes in Qubo product reviews from Amazon, based on manual review of hundreds of reviews across multiple products. 
# This taxonomy will be used to categorise and summarise review content at scale, to identify key pain points and areas of improvement 
# for Qubo products and customer experience. It follows a hierarchical structure with high-level categories (e.g. Video Quality) and 
# specific issues / praises within each category (e.g. Blurry footage, Clear footage). The devices can be Smart cameras (Cam360, bullet cameras, indoor cameras), 
# or Dashcams, or Smart Home devices (Plugs, Bulbs, etc.) or Smart Door Locks, Video Doorbells, etc. The reviews may contain 
# feedback on any aspect of the product or customer experience, and we will categorise them into this taxonomy to identify common themes and insights.
# the 2 level hierarchy is represented as a dictionary of lists, where the keys are the high-level categories and the values are lists of 
# specific issues / praises within each category. The keys represent the main themes that customers talk about in their reviews, 
# and the values represent the specific feedback that customers give within each theme. Keys have to be unique, but values can be repeated across different keys 
# (e.g. "Clear footage at night" can be a praise for both Video Quality and Night Vision). Following are a few we have identified so far, 
# based on manual review of hundreds of reviews across multiple Qubo products. Some might be wrong and redundant, some might need to be added as per product.

TAXONOMY = {

    "Video Quality — Daytime": [
        "Blurry or low resolution",
        "Faces or number plates not readable",
        "Poor clarity in bright sunlight",
        "Colour accuracy / washed out footage",
        "Wide angle distortion",
        "Rear camera blurry (dashcam)",
        "Clear and sharp daytime footage",
        "Number plates clearly visible",
        "Wide angle covers full road / room",
    ],

    "Video Quality — Night & Low Light": [
        "Poor night vision",
        "IR overexposure or washed out at night",
        "Cannot see faces or details at night",
        "Excellent night vision",
        "Clear footage at night (streetlights, signboards visible)",
        "Balanced IR without overexposure",
    ],

    
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

    
    "App Features": [
        "Recording / timeline navigation confusing",
        "Cannot split or trim recordings in app",
        "Qubo watermark cannot be removed from footage",
        "Multi-user access requires paid subscription",
        "Auto-recording feature not activating",
        "Notifications not working or delayed",
        "Wrong timestamp on recordings",
        "Motion detection well-calibrated",
        "Accurate person / motion alerts",
        "Alert frequency is appropriate",
        "App UI intuitive and easy to navigate",
        "Good notification system",
        "Easy footage access and download",
        "App manages multiple devices well",
    ],

   
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

   
    "Wi-Fi Stability": [
        "Keeps disconnecting from Wi-Fi randomly",
        "Camera goes offline silently (no alert)",
        "Requires daily manual reset to reconnect",
        "Needs troubleshooting most times after power cut",
        "Stable Wi-Fi connection over months",
        "No unexpected disconnects",
        "Reconnects automatically after power outage",
    ],

    
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

 
    "Overheating": [
        "Dashcam shuts off in direct sunlight",
        "Stops working in Indian summer heat (40°C+)",
        "Cannot be powered on with button when overheated",
        "Thermal shutdown caused missed recording at critical moment",
        "Video hangs or freezes when device is hot",
        "Handles Indian heat well",
        "No overheating issues after long drives",
    ],

    
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

    
    "False / Excessive Alerts": [
        "Alerts triggered constantly with nothing in frame",
        "Motion detection too sensitive",
        "False person detection",
        "Alert flood after firmware update",
        "Notification spam making phone unusable",
    ],

   
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

    "Windshield Glare": [
        "Reflections and glare visible in footage",
        "Bright sunlight causes glare across entire video",
        "Needs CPL filter for usable footage (not included in box)",
        "Night headlights cause significant lens flare",
        "No glare or reflection issues",
        "Clear footage in high-contrast lighting conditions",
    ],

   
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

    
    "Subscription & Paywall": [
        "More than 2 simultaneous users requires paid plan",
        "Cloud storage too expensive",
        "Features locked behind subscription unexpectedly",
        "SD card as free alternative to cloud appreciated",
        "Cloud storage pricing reasonable",
    ],

  
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

    
    "Delivery & Packaging": [
        "Broken seal on delivery",
        "Damaged product on arrival",
        "Wrong product delivered",
        "Missing items in package",
        "Fast delivery",
        "Well-packaged and protected",
    ],

}
