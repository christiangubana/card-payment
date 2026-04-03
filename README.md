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
4. User clicks **Pay** → parent sends `VALIDATE_AND_TOKENIZE` to iframe
5. Iframe validates fields:
   - If errors → sends `VALIDATION_ERROR` with error details back to parent
   - If valid → sends `VALIDATION_SUCCESS`, then mocks a tokenisation API call
6. Iframe returns `CARD_TOKENIZED` with token + masked PAN to parent
7. Parent performs a mocked payment request using the amount + card token

## Running Locally

**Prerequisites:** [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/) (v14 or later).

```bash
# 1. Clone the repository
git clone https://github.com/ApolloSigma/card-payment.git

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

All dynamic content is inserted via `textContent` or safe DOM construction (`createElement` / `appendChild`). No user-controlled data passes through `innerHTML`. An `escapeHTML` utility is available for attribute contexts.

### PCI scope separation

Card details (PAN, CVV, expiry) exist **only inside the iframe**. The main page never sees raw card data — it only receives a tokenised reference after the iframe validates and mocks a tokenisation API call. This mirrors how real hosted payment pages minimise PCI DSS scope.

### Autocomplete disabled

All card input fields use `autocomplete="off"` to prevent browsers from caching sensitive card data, consistent with PCI DSS requirements.

### Content Security Policy

The main page includes a `<meta>` CSP header restricting scripts, styles, and frames to `'self'`, preventing injection of external resources.

### Iframe sandbox

The iframe uses `sandbox="allow-scripts allow-same-origin"`. In production, the iframe would be served from a **different origin** (the payment processor's domain), which makes the sandbox effective. In this local mock, both pages share the same origin — a console warning notes this, which is expected and harmless for the demo.

## Test Cases

Open the browser DevTools **Console** tab to observe `[Payment Request]` logs during payment flows.

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
   - Toast shows "Validating card..." (blue).
   - Toast shows "Card tokenized, processing payment..." (blue).
   - Toast shows "Payment of 100.00 EUR successful!" (green) — *note: there is a ~10% random chance the mock declines; retry if it does*.
   - The form fields are cleared after a successful payment.
   - A Visa stored card tile appears at the top of the page showing `4111****1111` and `12/28`.
5. Open DevTools Console and verify the `[Payment Request]` log shows `{ amount: "100.00", currency: "EUR", cardToken: "tok_...", timestamp: "..." }`.

### Test 4 — Paying with a stored card

1. Continue from Test 3 (a saved Visa card should be visible), or open `http://localhost:3000/?demo` to load demo stored cards.
2. Click on the **Visa** card tile.
3. **Expected:** The selected card shows a green/lime border.
4. Click **Pay 100.00 EUR (Fee included)**.
5. **Expected:**
   - Button shows "Processing..." — the payment uses the stored card's token directly (no iframe validation occurs).
   - Toast shows "Processing payment with saved card..." (blue).
   - Toast shows "Payment of 100.00 EUR successful!" (green).
6. Open DevTools Console and verify the `[Payment Request – Stored Card]` log appears with the saved card's token.

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
