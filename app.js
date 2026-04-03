(function () {
  'use strict';

  /* ── Configuration ──────────────────────────────────── */
  var PAYMENT_AMOUNT = '100.00';
  var PAYMENT_CURRENCY = 'EUR';

  /* ── DOM references ─────────────────────────────────── */
  var cardIframe = document.getElementById('card-iframe');
  var payButton = document.getElementById('pay-button');
  var storedCardsSection = document.getElementById('stored-cards-section');
  var storedCardsGrid = document.getElementById('stored-cards-grid');
  var newCardSection = document.getElementById('new-card-section');
  var validationErrorsDiv = document.getElementById('validation-errors');
  var saveCardToggle = document.getElementById('save-card-toggle');
  var toastEl = document.getElementById('toast');
  var cardDetailsTitle = document.getElementById('card-details-title');

  /* ── State ───────────────────────────────────────────── */
  var iframeReady = false;
  var processing = false;
  var selectedStoredCard = null;

  var storedCards = loadStoredCards();

  /* ── Stored cards persistence (localStorage mock) ───── */
  function loadStoredCards() {
    try {
      var raw = localStorage.getItem('storedCards');
      return raw ? JSON.parse(raw) : [];
    } catch (_) {
      return [];
    }
  }

  function saveStoredCards() {
    localStorage.setItem('storedCards', JSON.stringify(storedCards));
  }

  /* ── Render stored cards ────────────────────────────── */
  function renderStoredCards() {
    storedCardsGrid.innerHTML = '';

    if (storedCards.length === 0) {
      storedCardsSection.classList.add('hidden');
      cardDetailsTitle.textContent = 'Card details';
      newCardSection.classList.remove('hidden');
      selectedStoredCard = null;
      return;
    }

    storedCardsSection.classList.remove('hidden');

    storedCards.forEach(function (card, index) {
      var el = document.createElement('div');
      el.className = 'stored-card' + (selectedStoredCard === index ? ' selected' : '');
      el.innerHTML = buildStoredCardHTML(card);
      el.setAttribute('data-index', index);
      el.setAttribute('role', 'button');
      el.setAttribute('tabindex', '0');
      el.setAttribute('aria-label', card.cardBrand + ' ending in ' + card.last4);

      el.addEventListener('click', function (e) {
        if (e.target.closest('.delete-card-btn')) return;
        selectStoredCard(index);
      });

      var deleteBtn = el.querySelector('.delete-card-btn');
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteStoredCard(index);
      });

      storedCardsGrid.appendChild(el);
    });

    newCardSection.classList.remove('hidden');
    cardDetailsTitle.textContent = 'Card details';
  }

  function buildStoredCardHTML(card) {
    var brandHTML = '';
    if (card.cardBrand === 'visa') {
      brandHTML = '<div class="card-brand-icon visa">VISA</div>';
    } else if (card.cardBrand === 'mastercard') {
      brandHTML = '<div class="card-brand-icon mastercard">'
        + '<div class="mastercard-circles"><span></span><span></span></div></div>';
    } else {
      brandHTML = '<div class="card-brand-icon" style="background:#555;font-size:9px;">'
        + card.cardBrand.toUpperCase() + '</div>';
    }

    return ''
      + '<div class="stored-card-header">'
      +   brandHTML
      +   '<button class="delete-card-btn" title="Delete card" aria-label="Delete ' + card.cardBrand + ' card">&#128465;</button>'
      + '</div>'
      + '<div class="stored-card-info">'
      +   card.maskedPan + '<br>' + card.expiryDate
      + '</div>';
  }

  function selectStoredCard(index) {
    if (selectedStoredCard === index) {
      selectedStoredCard = null;
    } else {
      selectedStoredCard = index;
    }
    clearValidationErrors();
    renderStoredCards();
  }

  function deleteStoredCard(index) {
    storedCards.splice(index, 1);
    if (selectedStoredCard === index) selectedStoredCard = null;
    else if (selectedStoredCard !== null && selectedStoredCard > index) selectedStoredCard--;
    saveStoredCards();
    renderStoredCards();
  }

  /* ── Style injection CSS to send into iframe ────────── */
  function getIframeStyles() {
    return ''
      + 'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: transparent; color: #fff; }'
      + '.form-group { margin-bottom: 16px; }'
      + '.form-row { display: flex; gap: 12px; }'
      + '.form-group.half { flex: 1; }'
      + 'label { display: block; font-size: 12px; color: #8a8a8a; margin-bottom: 6px; letter-spacing: 0.3px; }'
      + 'input { width: 100%; padding: 16px 14px; background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 12px; color: #fff; font-size: 16px; outline: none; transition: border-color 0.2s ease; }'
      + 'input::placeholder { color: #555; }'
      + 'input:focus { border-color: #d1f526; }'
      + 'input.input-error { border-color: #ff4d4d; }'
      + '.error-message { display: block; font-size: 12px; color: #ff4d4d; margin-top: 4px; min-height: 16px; }';
  }

  /* ── postMessage communication ──────────────────────── */
  function sendToIframe(type, payload) {
    if (!cardIframe || !cardIframe.contentWindow) return;
    cardIframe.contentWindow.postMessage({ type: type, payload: payload || {} }, '*');
  }

  window.addEventListener('message', function (event) {
    var data = event.data;
    if (!data || !data.type) return;

    switch (data.type) {
      case 'CARD_IFRAME_READY':
        iframeReady = true;
        sendToIframe('INJECT_STYLES', { css: getIframeStyles() });
        break;

      case 'STYLES_APPLIED':
        resizeIframe();
        break;

      case 'VALIDATION_ERROR':
        handleValidationErrors(data.payload.errors);
        setProcessing(false);
        break;

      case 'VALIDATION_SUCCESS':
        clearValidationErrors();
        showToast('Validating card...', 'info');
        break;

      case 'CARD_TOKENIZED':
        handleTokenized(data.payload);
        break;
    }
  });

  /* ── Iframe resize ──────────────────────────────────── */
  function resizeIframe() {
    try {
      var body = cardIframe.contentDocument || cardIframe.contentWindow.document;
      cardIframe.style.height = body.body.scrollHeight + 20 + 'px';
    } catch (_) {
      cardIframe.style.height = '320px';
    }
  }

  cardIframe.addEventListener('load', function () {
    setTimeout(resizeIframe, 200);
  });

  /* ── Validation errors ──────────────────────────────── */
  function handleValidationErrors(errors) {
    validationErrorsDiv.innerHTML = '';
    errors.forEach(function (err) {
      var p = document.createElement('p');
      p.textContent = err.message;
      validationErrorsDiv.appendChild(p);
    });
    showToast('Please fix the errors above', 'error');
  }

  function clearValidationErrors() {
    validationErrorsDiv.innerHTML = '';
  }

  /* ── Tokenization result ────────────────────────────── */
  function handleTokenized(tokenData) {
    showToast('Card tokenized, processing payment...', 'info');

    if (saveCardToggle.checked) {
      var alreadySaved = storedCards.some(function (c) { return c.maskedPan === tokenData.maskedPan; });
      if (!alreadySaved) {
        storedCards.push({
          token: tokenData.token,
          maskedPan: tokenData.maskedPan,
          last4: tokenData.last4,
          expiryDate: tokenData.expiryDate,
          cardholderName: tokenData.cardholderName,
          cardBrand: tokenData.cardBrand,
        });
        saveStoredCards();
        renderStoredCards();
      }
    }

    mockPaymentRequest(tokenData.token);
  }

  /* ── Mock payment ───────────────────────────────────── */
  function mockPaymentRequest(token) {
    var request = {
      amount: PAYMENT_AMOUNT,
      currency: PAYMENT_CURRENCY,
      cardToken: token,
      timestamp: new Date().toISOString(),
    };

    console.log('[Payment Request]', request);

    setTimeout(function () {
      var success = Math.random() > 0.1;
      if (success) {
        showToast('Payment of ' + PAYMENT_AMOUNT + ' ' + PAYMENT_CURRENCY + ' successful!', 'success');
        sendToIframe('CLEAR_FORM');
      } else {
        showToast('Payment declined. Please try again.', 'error');
      }
      setProcessing(false);
    }, 1200);
  }

  function mockPaymentWithStoredCard(card) {
    console.log('[Payment Request – Stored Card]', {
      amount: PAYMENT_AMOUNT,
      currency: PAYMENT_CURRENCY,
      cardToken: card.token,
      timestamp: new Date().toISOString(),
    });

    setTimeout(function () {
      var success = Math.random() > 0.1;
      if (success) {
        showToast('Payment of ' + PAYMENT_AMOUNT + ' ' + PAYMENT_CURRENCY + ' successful!', 'success');
      } else {
        showToast('Payment declined. Please try again.', 'error');
      }
      setProcessing(false);
    }, 1200);
  }

  /* ── Pay button ─────────────────────────────────────── */
  payButton.addEventListener('click', function () {
    if (processing) return;

    clearValidationErrors();
    setProcessing(true);

    if (selectedStoredCard !== null && storedCards[selectedStoredCard]) {
      showToast('Processing payment with saved card...', 'info');
      mockPaymentWithStoredCard(storedCards[selectedStoredCard]);
    } else {
      sendToIframe('VALIDATE_AND_TOKENIZE');
    }
  });

  function setProcessing(state) {
    processing = state;
    payButton.disabled = state;
    if (state) {
      payButton.innerHTML = '<span class="spinner"></span> Processing...';
    } else {
      payButton.textContent = 'Pay ' + PAYMENT_AMOUNT + ' ' + PAYMENT_CURRENCY + ' (Fee included)';
    }
  }

  /* ── Toast notifications ────────────────────────────── */
  var toastTimer = null;

  function showToast(message, type) {
    toastEl.textContent = message;
    toastEl.className = 'toast ' + (type || 'info');

    clearTimeout(toastTimer);

    requestAnimationFrame(function () {
      toastEl.classList.add('visible');
    });

    toastTimer = setTimeout(function () {
      toastEl.classList.remove('visible');
    }, 3500);
  }

  /* ── Demo mode: ?demo seeds sample stored cards ──────── */
  if (window.location.search.indexOf('demo') !== -1 && storedCards.length === 0) {
    storedCards = [
      { token: 'tok_demo_visa', maskedPan: '4111****1111', last4: '1111', expiryDate: '12/28', cardholderName: 'John Smith', cardBrand: 'visa' },
      { token: 'tok_demo_mc', maskedPan: '5500****0004', last4: '0004', expiryDate: '06/27', cardholderName: 'Jane Doe', cardBrand: 'mastercard' },
    ];
    saveStoredCards();
  }

  /* ── Init ────────────────────────────────────────────── */
  renderStoredCards();
})();
