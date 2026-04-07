(function () {
  'use strict';

  var PAYMENT_AMOUNT = '100.00';
  var PAYMENT_CURRENCY = 'EUR';
  var IFRAME_ORIGIN = window.location.origin;
  var SUCCESS_URL = '/payment/success';
  var FAILURE_URL = '/payment/failure';

  var ALLOWED_INBOUND_MESSAGES = [
    'CARD_IFRAME_READY',
    'STYLES_APPLIED',
    'VALIDATION_ERROR',
    'CARD_TOKENIZED'
  ];

  var cardIframe = document.getElementById('card-iframe');
  var payButton = document.getElementById('pay-button');
  var storedCardsSection = document.getElementById('stored-cards-section');
  var storedCardsGrid = document.getElementById('stored-cards-grid');
  var newCardSection = document.getElementById('new-card-section');
  var validationErrorsDiv = document.getElementById('validation-errors');
  var saveCardToggle = document.getElementById('save-card-toggle');
  var toastEl = document.getElementById('toast');
  var cardDetailsTitle = document.getElementById('card-details-title');

  var iframeReady = false;
  var processing = false;
  var selectedStoredCard = null;
  var storedCards = loadStoredCards();

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

  /* Stored cards */

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
      storedCardsGrid.appendChild(buildStoredCardElement(card, index));
    });

    newCardSection.classList.remove('hidden');
    cardDetailsTitle.textContent = 'Card details';
  }

  function buildStoredCardElement(card, index) {
    var el = document.createElement('div');
    el.className = 'stored-card' + (selectedStoredCard === index ? ' selected' : '');
    el.setAttribute('data-index', index);
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.setAttribute('aria-label', card.cardBrand + ' ending in ' + card.last4);

    var header = document.createElement('div');
    header.className = 'stored-card-header';

    var brandIcon = document.createElement('div');
    if (card.cardBrand === 'visa') {
      brandIcon.className = 'card-brand-icon visa';
      brandIcon.textContent = 'VISA';
    } else if (card.cardBrand === 'mastercard') {
      brandIcon.className = 'card-brand-icon mastercard';
      var circles = document.createElement('div');
      circles.className = 'mastercard-circles';
      circles.appendChild(document.createElement('span'));
      circles.appendChild(document.createElement('span'));
      brandIcon.appendChild(circles);
    } else {
      brandIcon.className = 'card-brand-icon';
      brandIcon.style.background = '#555';
      brandIcon.style.fontSize = '9px';
      brandIcon.textContent = card.cardBrand.toUpperCase();
    }

    var deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-card-btn';
    deleteBtn.title = 'Delete card';
    deleteBtn.setAttribute('aria-label', 'Delete ' + card.cardBrand + ' card');
    deleteBtn.textContent = '\uD83D\uDDD1';

    header.appendChild(brandIcon);
    header.appendChild(deleteBtn);

    var info = document.createElement('div');
    info.className = 'stored-card-info';
    info.appendChild(document.createTextNode(card.maskedPan));
    info.appendChild(document.createElement('br'));
    info.appendChild(document.createTextNode(card.expiryDate));

    el.appendChild(header);
    el.appendChild(info);

    el.addEventListener('click', function (e) {
      if (e.target.closest('.delete-card-btn')) return;
      selectStoredCard(index);
    });

    deleteBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      deleteStoredCard(index);
    });

    return el;
  }

  function selectStoredCard(index) {
    selectedStoredCard = (selectedStoredCard === index) ? null : index;
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

  /* Style injection — CSS sent to iframe via postMessage */

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

  /* postMessage — origin-validated, allowlisted */

  function sendToIframe(type, payload) {
    if (!iframeReady || !cardIframe || !cardIframe.contentWindow) return;
    console.log('[postMessage → iframe]', type);
    cardIframe.contentWindow.postMessage({ type: type, payload: payload || {} }, IFRAME_ORIGIN);
  }

  window.addEventListener('message', function (event) {
    if (event.origin !== IFRAME_ORIGIN) return;

    var data = event.data;
    if (!data || !data.type) return;
    if (ALLOWED_INBOUND_MESSAGES.indexOf(data.type) === -1) return;

    console.log('[postMessage ← iframe]', data.type);

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

      case 'CARD_TOKENIZED':
        handleTokenized(data.payload);
        break;
    }
  });

  function resizeIframe() {
    try {
      var doc = cardIframe.contentDocument || cardIframe.contentWindow.document;
      cardIframe.style.height = doc.body.scrollHeight + 20 + 'px';
    } catch (_) {
      cardIframe.style.height = '320px';
    }
  }

  cardIframe.addEventListener('load', function () {
    setTimeout(resizeIframe, 200);
  });

  /* Validation errors */

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

  /* Tokenization + payment */

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

    processPayment(tokenData.token, false);
  }

  function processPayment(token, isStoredCard) {
    var label = isStoredCard ? '[Payment] POST /payments/process (stored card)' : '[Payment] POST /payments/process';
    console.log(label, {
      amount: PAYMENT_AMOUNT,
      currency: PAYMENT_CURRENCY,
      cardToken: token,
      timestamp: new Date().toISOString(),
    });

    setTimeout(function () {
      var success = Math.random() > 0.1;
      if (success) {
        console.log('[Redirect] →', SUCCESS_URL);
        showToast('Payment of ' + PAYMENT_AMOUNT + ' ' + PAYMENT_CURRENCY + ' successful!', 'success');
        if (!isStoredCard) sendToIframe('CLEAR_FORM');
      } else {
        console.log('[Redirect] →', FAILURE_URL);
        showToast('Payment declined. Please try again.', 'error');
      }
      setProcessing(false);
    }, 1200);
  }

  /* Pay button */

  payButton.addEventListener('click', function () {
    if (processing) return;

    clearValidationErrors();
    setProcessing(true);

    if (selectedStoredCard !== null && storedCards[selectedStoredCard]) {
      showToast('Processing payment with saved card...', 'info');
      processPayment(storedCards[selectedStoredCard].token, true);
    } else {
      sendToIframe('TOKENIZE_CARD');
    }
  });

  function setProcessing(state) {
    processing = state;
    payButton.disabled = state;
    if (state) {
      payButton.textContent = '';
      var spinner = document.createElement('span');
      spinner.className = 'spinner';
      payButton.appendChild(spinner);
      payButton.appendChild(document.createTextNode(' Processing...'));
    } else {
      payButton.textContent = 'Pay ' + PAYMENT_AMOUNT + ' ' + PAYMENT_CURRENCY + ' (Fee included)';
    }
  }

  /* Toast */

  var toastTimer = null;

  function showToast(message, type) {
    toastEl.textContent = message;
    toastEl.className = 'toast ' + (type || 'info');
    clearTimeout(toastTimer);
    requestAnimationFrame(function () { toastEl.classList.add('visible'); });
    toastTimer = setTimeout(function () { toastEl.classList.remove('visible'); }, 3500);
  }

  /* Demo mode — ?demo seeds sample stored cards */

  if (window.location.search.indexOf('demo') !== -1 && storedCards.length === 0) {
    storedCards = [
      { token: 'tok_demo_visa', maskedPan: '4111****1111', last4: '1111', expiryDate: '12/28', cardholderName: 'John Smith', cardBrand: 'visa' },
      { token: 'tok_demo_mc', maskedPan: '5500****0004', last4: '0004', expiryDate: '06/27', cardholderName: 'Jane Doe', cardBrand: 'mastercard' },
    ];
    saveStoredCards();
  }

  renderStoredCards();
})();
