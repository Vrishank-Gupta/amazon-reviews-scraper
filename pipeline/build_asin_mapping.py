"""
Rebuild data/asins.csv from the authoritative product mapping sheet
(data/mapping_updated.xlsx). Run this whenever the mapping sheet changes.

Source sheet columns: Category | SKU id | Product | ASIN
Output CSV columns:   asin, product_name, category, sku_code

Cleanup applied:
- Skips the blank divider row (category label with no SKU/name/ASIN).
- Skips rows with no real ASIN (blank or literal "NA") — reported, not written.
- Normalizes sku_code of "NA"/blank to an empty string.
- Normalizes category casing: "DashCam" -> "Dashcam".
- B0F8VK4H3P appears twice (once as "Smart Door Locks", once as "EOL Door Locks");
  keeps the "Smart Door Locks" (active) row.
"""
import csv
import os
import sys

import openpyxl

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MAPPING_XLSX = os.path.join(PROJECT_ROOT, "data", "mapping_updated.xlsx")
ASINS_CSV = os.path.join(PROJECT_ROOT, "data", "asins.csv")

CATEGORY_ALIASES = {
    "dashcam": "Dashcam",
}

# ASIN -> category to keep when the same ASIN appears on more than one row.
DUPLICATE_ASIN_OVERRIDES = {
    "B0F8VK4H3P": "Smart Door Locks",
}


def normalize_category(raw):
    cat = (raw or "").strip()
    return CATEGORY_ALIASES.get(cat.lower(), cat)


def load_mapping_rows():
    wb = openpyxl.load_workbook(MAPPING_XLSX, data_only=True)
    ws = wb["Sheet1"]

    rows_by_asin = {}
    order = []
    unreachable = []

    for excel_row, (cat, sku, name, asin) in enumerate(ws.iter_rows(min_row=2, values_only=True), start=2):
        if not any([cat, sku, name, asin]):
            continue  # blank divider row

        if not asin or (isinstance(asin, str) and asin.strip().upper() == "NA"):
            unreachable.append((excel_row, cat, sku, name))
            continue

        asin = asin.strip()
        category = normalize_category(cat)
        product_name = (name or "").strip()
        sku_code = "" if (not sku or (isinstance(sku, str) and sku.strip().upper() == "NA")) else sku.strip()

        if asin in rows_by_asin:
            override_category = DUPLICATE_ASIN_OVERRIDES.get(asin)
            if override_category is not None and category != override_category:
                continue  # drop this duplicate row, keep the override-matching one
        else:
            order.append(asin)

        rows_by_asin[asin] = {
            "asin": asin,
            "product_name": product_name,
            "category": category,
            "sku_code": sku_code,
        }

    return [rows_by_asin[a] for a in order], unreachable


def main():
    rows, unreachable = load_mapping_rows()

    with open(ASINS_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["asin", "product_name", "category", "sku_code"], lineterminator="\n")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)

    print(f"Wrote {len(rows)} ASIN mappings to {ASINS_CSV}")
    if unreachable:
        print(f"\n{len(unreachable)} sheet row(s) skipped (no real ASIN, cannot attach reviews):")
        for excel_row, cat, sku, name in unreachable:
            print(f"  row {excel_row}: category={cat!r} sku={sku!r} name={name!r}")


if __name__ == "__main__":
    sys.exit(main())
