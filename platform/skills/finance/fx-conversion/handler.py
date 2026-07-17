"""FX conversion skill — demo rates, USD base.

Replace DEMO_RATES with a live rates source for production use; the skill
contract (skill.yaml) stays the same.
"""

DEMO_RATES = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.79,
    "JPY": 155.0,
    "INR": 83.5,
    "CHF": 0.88,
}


def convert_currency(amount: float, from_currency: str, to_currency: str) -> str:
    """Convert a monetary amount between currencies (demo FX rates, USD base).
    Supported currencies: USD, EUR, GBP, JPY, INR, CHF."""
    src = from_currency.upper()
    dst = to_currency.upper()
    if src not in DEMO_RATES or dst not in DEMO_RATES:
        supported = ", ".join(sorted(DEMO_RATES))
        return f"Unsupported currency. Supported: {supported}"
    usd_amount = amount / DEMO_RATES[src]
    converted = usd_amount * DEMO_RATES[dst]
    return f"{amount:,.2f} {src} = {converted:,.2f} {dst} (via USD, demo rates)"
