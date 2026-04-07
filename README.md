# Card Payment App

A mocked card payment page demonstrating the separation between a main payment page and an embedded iframe (Hosted Payment Page) for PCI-compliant card details collection. All communication between the two pages happens via browser `postMessage` window events.

<img width="3241" height="1600" alt="Image" src="https://github.com/user-attachments/assets/702cf114-97c3-4300-93ac-b7e64e05c49a" />

## Architecture

```
┌─────────────────────────────────────┐
│  Main Page (index.html)             │
│  - Stored cards UI                  │
│  - Save card toggle                 │
│  - Pay button                       │
│  - Style injection → iframe         │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Card Iframe (card-form.html) │  │
│  │  - Cardholder name            │  │
│  │  - Card number (PAN)          │  │
│  │  - Expiry date                │  │
│  │  - CVV/CVC                    │  │
│  │  - Validation logic           │  │
│  │  - Mock tokenisation          │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Communication Flow (postMessage)

1. Iframe loads → sends `CARD_IFRAME_READY` to parent
2. Parent receives ready signal → sends `INJECT_STYLES` with CSS payload
3. Iframe applies styles → sends `STYLES_APPLIED`
4. User clicks **Pay** → parent sends `TOKENIZE_CARD` to iframe
5. Iframe validates fields:
   - If errors → sends `VALIDATION_ERROR` with error details back to parent
   - If valid → mocks `POST /cards/tokenize`, then sends `CARD_TOKENIZED` with token + masked PAN
6. Parent performs mocked `POST /payments/process` using amount + card token
7. Parent logs redirect to success/failure URL

## Running Locally

**Prerequisites:** [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/) (v14 or later).

```bash
# 1. Clone the repository
git clone https://github.com/christiangubana/card-payment.git

# 2. Navigate into the project
cd card-payment

# 3. Start the local server
npm start
```

This starts a server (the port is printed in the terminal, typically `http://localhost:3000`). Open that URL in your browser.

> **Demo mode:** To load the page with pre-seeded stored cards (Visa + Mastercard), append `?demo` to the URL:
> `http://localhost:3000/?demo`

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main payment page — stored cards, iframe embed, save-card toggle, pay button |
| `styles.css` | Dark theme styling for the main page (not the iframe) |
| `app.js` | Main page logic — postMessage handling, stored cards management, mocked payment |
| `card-form.html` | Iframe hosted payment page (PCI scope) — contains only the card form fields |
| `card-form.js` | Iframe logic — receives injected styles, validates fields, mocks tokenisation |
| `package.json` | Project metadata and `npm start` script |

## Design Decisions & Trade-offs

### Why iframe + postMessage?

The core requirement is PCI scope separation: card details (PAN, CVV) must never touch the merchant's page. In production, the iframe would be served from the **payment processor's domain**, meaning the merchant page physically cannot access card data — even via JavaScript. The `postMessage` API is the only bridge between the two origins.

This is the same pattern used by Stripe Elements, Adyen Drop-in, and Checkout.com Frames. The main page only ever receives a token back, never raw card data.

**Trade-off:** The iframe boundary makes styling harder (CSS can't cross origins). This is solved by injecting styles via `postMessage` — the parent sends CSS as a string, the iframe applies it to a `<style>` tag. This gives the merchant full visual control while keeping card data isolated.

### Why vanilla HTML/CSS/JS (no framework)?

1. **The brief asks for a working mockup** — a framework adds build tooling and boilerplate that obscures the implementation logic. The entire solution is 6 files with zero dependencies.
2. **Easier to review** — every file is readable top-to-bottom with no transpilation.
3. **Mirrors production reality** — hosted payment pages (the iframe side) are typically lightweight, framework-free bundles to minimise load time and attack surface.

**Trade-off:** No component reuse or reactive state. For a single-page mock this is fine; a multi-page product would warrant a framework.

### Why localStorage for stored cards?

The brief requires stored cards without a backend. `localStorage` is the simplest persistence that survives page reloads. The stored data contains only tokens and masked PANs — never raw card details.

**Trade-off:** Not secure for real tokens. In production, stored cards would come from an authenticated API call (`GET /payment-methods`).

### What would change in production?

| This mock | Production |
|-----------|------------|
| Iframe on same origin (`localhost`) | Iframe on payment processor's domain |
| Styles injected via postMessage | Same — this is how real hosted pages work |
| `window.location.origin` for postMessage target | Hardcoded production origin |
| Mock tokenisation (`setTimeout`) | Real API call to `POST /cards/tokenize` |
| Mock payment (`Math.random`) | Real API call to `POST /payments/process` |
| `localStorage` for saved cards | Backend API (`GET /payment-methods`) |
| CSP via `<meta>` tag | CSP via HTTP response header |

## Security Considerations

This is a mock/demo application, but it implements real security patterns that would be required in production:

### Origin validation on postMessage

Both the main page and the iframe validate `event.origin` before processing any incoming message. Messages from unexpected origins are silently discarded. Each side also maintains an explicit allowlist of accepted message types (`ALLOWED_INBOUND_MESSAGES`), preventing injection of unexpected commands.

```
// card-form.js — only processes messages from the known parent
if (event.origin !== PARENT_ORIGIN) return;
if (ALLOWED_INBOUND_MESSAGES.indexOf(data.type) === -1) return;
```

### XSS prevention

All dynamic content is inserted via `textContent` or safe DOM construction (`createElement` / `appendChild`). No user-controlled data passes through `innerHTML`.

### PCI scope separation

Card details (PAN, CVV, expiry) exist **only inside the iframe**. The main page never sees raw card data — it only receives a tokenised reference after the iframe validates and mocks a tokenisation API call. This mirrors how real hosted payment pages minimise PCI DSS scope.

### Autocomplete disabled

All card input fields use `autocomplete="off"` to prevent browsers from caching sensitive card data, consistent with PCI DSS requirements.

### Content Security Policy

The main page includes a `<meta>` CSP header restricting scripts, styles, and frames to `'self'`, preventing injection of external resources.

### Iframe sandbox

The iframe uses `sandbox="allow-scripts allow-same-origin"`. In production, the iframe would be served from a **different origin** (the payment processor's domain), which makes the sandbox effective. In this local mock, both pages share the same origin — a console warning notes this, which is expected and harmless for the demo.

## Test Cases

Open the browser DevTools **Console** tab to observe the full postMessage flow and payment logs.

### Test 1 — Style injection from main page to iframe

1. Open `http://localhost:3000` in your browser.
2. **Expected:** The card form fields inside the iframe have the dark theme styling (dark input backgrounds, rounded borders, light text, grey labels) — matching the main page's look and feel.
3. Open `card-form.html` directly in a separate tab (`http://localhost:3000/card-form.html`).
4. **Expected:** The form appears unstyled (plain browser defaults, white background) — confirming that all styling is injected from the parent page via `postMessage`, not hardcoded in the iframe.

### Test 2 — Validation errors on empty / invalid form

1. Open `http://localhost:3000` (no stored cards).
2. Without filling in any fields, click **Pay 100.00 EUR (Fee included)**.
3. **Expected:**
   - The button briefly shows "Processing..." then returns to normal.
   - All four input fields inside the iframe show red borders.
   - Error messages appear below each field: "Enter the cardholder name", "Enter a valid card number", "Enter a valid expiry (MM/YY)", "Enter a valid CVV".
   - The same error messages appear in the main page below the iframe.
   - A red toast notification shows "Please fix the errors above".
4. Fill in only the cardholder name (e.g. "John Smith") and click **Pay** again.
5. **Expected:** Only the cardholder name field clears its error; the other three fields still show errors.
6. Fill in a card number that fails the Luhn check (e.g. `1234 5678 9012 3456`) and click **Pay**.
7. **Expected:** The card number field shows "Card number is invalid".

### Test 3 — Successful new card payment + card saving

1. Open `http://localhost:3000`. Ensure the "Save card" toggle is **ON** (green).
2. Fill in valid card details:
   - **Cardholder name:** `John Smith`
   - **Card number:** `4111 1111 1111 1111` (valid Visa test number, passes Luhn)
   - **Expiry:** `12/28` (future date)
   - **CVV:** `456`
3. Click **Pay 100.00 EUR (Fee included)**.
4. **Expected:**
   - Button shows "Processing..." with a spinner.
   - Toast shows "Card tokenized, processing payment..." (blue).
   - Toast shows "Payment of 100.00 EUR successful!" (green) — *note: there is a ~10% random chance the mock declines; retry if it does*.
   - The form fields are cleared after a successful payment.
   - A Visa stored card tile appears at the top of the page showing `4111****1111` and `12/28`.
5. Open DevTools Console and verify the full postMessage chain is logged:
   ```
   [postMessage → iframe] TOKENIZE_CARD
   [Card Iframe] POST /cards/tokenize (mocked)
   [Card Iframe] Token received: tok_... | Masked PAN: 4111****1111
   [postMessage → parent] CARD_TOKENIZED
   [postMessage ← iframe] CARD_TOKENIZED
   [Payment] POST /payments/process { amount: "100.00", currency: "EUR", cardToken: "tok_..." }
   [Redirect] → /payment/success
   ```

### Test 4 — Paying with a stored card

1. Continue from Test 3 (a saved Visa card should be visible), or open `http://localhost:3000/?demo` to load demo stored cards.
2. Click on the **Visa** card tile.
3. **Expected:** The selected card shows a green/lime border.
4. Click **Pay 100.00 EUR (Fee included)**.
5. **Expected:**
   - Button shows "Processing..." — the payment uses the stored card's token directly (no iframe validation occurs).
   - Toast shows "Processing payment with saved card..." (blue).
   - Toast shows "Payment of 100.00 EUR successful!" (green).
6. Open DevTools Console and verify `[Payment] POST /payments/process (stored card)` and `[Redirect] → /payment/success` appear.

### Test 5 — Deselecting a stored card and using a new card

1. With stored cards visible, click a stored card to select it (green border).
2. Click the **same stored card** again.
3. **Expected:** The green border is removed (card is deselected). The card details form remains visible below.
4. Fill in new card details in the iframe and click **Pay**.
5. **Expected:** The new card details are validated and tokenised (not the stored card's token).

### Test 6 — Deleting a stored card

1. Open `http://localhost:3000/?demo` to load demo stored cards (Visa + Mastercard).
2. Click the **trash icon** (🗑) on the Mastercard tile.
3. **Expected:** The Mastercard tile is removed; only the Visa tile remains.
4. Click the **trash icon** on the Visa tile.
5. **Expected:** The stored cards section disappears entirely, leaving only the card details form.
6. Reload the page (without `?demo`).
7. **Expected:** No stored cards appear (they were deleted from localStorage).

### Test 7 — Save card toggle OFF prevents saving

1. Open `http://localhost:3000`. Turn the **Save card** toggle **OFF** (grey).
2. Fill in valid card details and click **Pay**.
3. **Expected:** Payment succeeds, but **no** stored card tile appears at the top of the page — the card was not saved.

### Test 8 — Input formatting

1. In the card number field, type `4111111111111111` rapidly.
2. **Expected:** It auto-formats to `4111 1111 1111 1111` (spaces inserted every 4 digits).
3. In the expiry field, type `1228`.
4. **Expected:** It auto-formats to `12/28` (slash inserted after 2 digits).
5. In the CVV field, type `abc456def`.
6. **Expected:** Only `456` appears (non-numeric characters are stripped). Maximum 4 digits allowed.
