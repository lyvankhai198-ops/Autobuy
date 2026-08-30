---
name: Canboso slot products
description: Safety rule for slot products that are hosted and fulfilled inside Canboso
---

Canboso slot products must never be matched to an external supplier mapping, even when their names share words with a mapped product such as Gemini Pro. Treat them as manual/Canboso-managed orders.

**Why:** Loose normalized-name matching caused a slot Gemini order to match the external Gemini Pro 18-month link product and trigger the wrong purchase.

**How to apply:** Detect the slot marker in product metadata or label before mapping, supplier fetch, or buy. Keep the order recorded for review but return without contacting the external supplier.