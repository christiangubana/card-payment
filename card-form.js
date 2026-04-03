(function () {
  'use strict';

  var PARENT_ORIGIN = window.location.origin;

  var ALLOWED_INBOUND_MESSAGES = [
    'INJECT_STYLES',
    'TOKENIZE_CARD',
    'CLEAR_FORM'
  ];

  /* ── DOM references ─────────────────────────────────── */
  var fields = {
    cardholderName: document.getElementById('cardholder-name'),
    cardNumber: document.getElementById('card-number'),
    expiryDate: document.getElementById('expiry-date'),
    cvv: document.getElementById('cvv'),
  };

  /* ── Formatting helpers ─────────────────────────────── */

  fields.cardNumber.addEventListener('input', function () {
    var v = this.value.replace(/\D/g, '').slice(0, 16);
    this.value = v.replace(/(.{4})/g, '$1 ').trim();
  });

  fields.expiryDate.addEventListener('input', function () {
    var v = this.value.replace(/\D/g, '').slice(0, 4);
    if (v.length >= 3) v = v.slice(0, 2) + '/' + v.slice(2);
    this.value = v;
  });

  fields.cvv.addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 4);
  });

  /* ── Validation ─────────────────────────────────────── */

  function clearErrors() {
    document.querySelectorAll('.error-message').forEach(function (el) {
      el.textContent = '';
    });
    document.querySelectorAll('input').forEach(function (el) {
      el.classList.remove('input-error');
    });
  }

  function showError(fieldId, message) {
    var el = document.querySelector('.error-message[data-for="' + fieldId + '"]');
    if (el) el.textContent = message;
    var input = document.getElementById(fieldId);
    if (input) input.classList.add('input-error');
  }

  function luhnCheck(num) {
    var sum = 0;
    var alt = false;
    for (var i = num.length - 1; i >= 0; i--) {
      var n = parseInt(num[i], 10);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return sum % 10 === 0;
  }

  function validate() {
    clearErrors();
    var errors = [];

    var name = fields.cardholderName.value.trim();
    if (!name || name.length < 2) {
      showError('cardholder-name', 'Enter the cardholder name');
      errors.push({ field: 'cardholder-name', message: 'Enter the cardholder name' });
    }

    var rawPan = fields.cardNumber.value.replace(/\s/g, '');
    if (!rawPan || rawPan.length < 13 || rawPan.length > 19) {
      showError('card-number', 'Enter a valid card number');
      errors.push({ field: 'card-number', message: 'Enter a valid card number' });
    } else if (!luhnCheck(rawPan)) {
      showError('card-number', 'Card number is invalid');
      errors.push({ field: 'card-number', message: 'Card number is invalid' });
    }

    var expiry = fields.expiryDate.value;
    var expiryMatch = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(expiry);
    if (!expiryMatch) {
      showError('expiry-date', 'Enter a valid expiry (MM/YY)');
      errors.push({ field: 'expiry-date', message: 'Enter a valid expiry (MM/YY)' });
    } else {
      var year = parseInt('20' + expiryMatch[2], 10);
      var month = parseInt(expiryMatch[1], 10);
      var now = new Date();
      var expDate = new Date(year, month);
      if (expDate <= now) {
        showError('expiry-date', 'Card has expired');
        errors.push({ field: 'expiry-date', message: 'Card has expired' });
      }
    }

    var cvv = fields.cvv.value.trim();
    if (!cvv || cvv.length < 3 || cvv.length > 4) {
      showError('cvv', 'Enter a valid CVV');
      errors.push({ field: 'cvv', message: 'Enter a valid CVV' });
    }

    return errors;
  }

  /* ── Mock tokenisation (simulates POST /cards/tokenize) ── */

  function mockTokenise() {
    var rawPan = fields.cardNumber.value.replace(/\s/g, '');
    var last4 = rawPan.slice(-4);
    var maskedPan = rawPan.slice(0, 4) + '****' + last4;
    var token = 'tok_' + Math.random().toString(36).slice(2, 14);

    console.log('[Card Iframe] POST /cards/tokenize (mocked)');

    return new Promise(function (resolve) {
      setTimeout(function () {
        var result = {
          token: token,
          maskedPan: maskedPan,
          last4: last4,
          expiryDate: fields.expiryDate.value,
          cardholderName: fields.cardholderName.value.trim(),
          cardBrand: detectBrand(rawPan),
        };
        console.log('[Card Iframe] Token received:', result.token, '| Masked PAN:', result.maskedPan);
        resolve(result);
      }, 600);
    });
  }

  function detectBrand(pan) {
    if (/^4/.test(pan)) return 'visa';
    if (/^5[1-5]/.test(pan) || /^2[2-7]/.test(pan)) return 'mastercard';
    if (/^3[47]/.test(pan)) return 'amex';
    return 'unknown';
  }

  /* ── postMessage listener (origin-validated) ────────── */

  window.addEventListener('message', function (event) {
    if (event.origin !== PARENT_ORIGIN) return;

    var data = event.data;
    if (!data || !data.type) return;
    if (ALLOWED_INBOUND_MESSAGES.indexOf(data.type) === -1) return;

    console.log('[postMessage ← parent]', data.type);

    switch (data.type) {
      case 'INJECT_STYLES':
        var styleEl = document.getElementById('injected-styles');
        if (styleEl) styleEl.textContent = data.payload.css;
        sendToParent('STYLES_APPLIED', {});
        break;

      case 'TOKENIZE_CARD':
        var errors = validate();
        if (errors.length > 0) {
          sendToParent('VALIDATION_ERROR', { errors: errors });
        } else {
          mockTokenise().then(function (result) {
            sendToParent('CARD_TOKENIZED', result);
          });
        }
        break;

      case 'CLEAR_FORM':
        fields.cardholderName.value = '';
        fields.cardNumber.value = '';
        fields.expiryDate.value = '';
        fields.cvv.value = '';
        clearErrors();
        break;
    }
  });

  function sendToParent(type, payload) {
    console.log('[postMessage → parent]', type);
    window.parent.postMessage({ type: type, payload: payload }, PARENT_ORIGIN);
  }

  /* ── Notify parent that iframe is ready ─────────────── */
  sendToParent('CARD_IFRAME_READY', {});
})();
