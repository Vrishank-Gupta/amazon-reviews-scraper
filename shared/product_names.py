import re


def normalize_name(value):
    return re.sub(r"\s+", " ", (value or "").strip())


def amazon_display_product_name(listing_name="", set_name="", fallback=""):
    """Return the Amazon-facing display name: listing title plus set/variant label."""
    listing = normalize_name(listing_name)
    variant = normalize_name(set_name)
    fallback = normalize_name(fallback)

    if not listing:
        return variant or fallback
    if not variant:
        return listing

    listing_norm = listing.casefold()
    variant_norm = variant.casefold()
    if listing_norm == variant_norm:
        return listing
    if variant_norm.startswith(listing_norm):
        return variant
    if listing_norm.startswith(variant_norm):
        return listing
    if listing_norm.endswith(f" {variant_norm}") or f" {variant_norm} " in f" {listing_norm} ":
        return listing
    return f"{listing} {variant}"
