'use strict';
/* Öneri ve sorun bildirimi: Supabase'deki feedback tablosuna gider, olmazsa e-postayla gönderilir */
const FEEDBACK_MAIL = 'emirhanduran27@gmail.com';
const FB_KINDS = { oneri: 'Öneri', sorun: 'Sorun', diger: 'Diğer' };

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = api.platform === 'ios' ? 'iPhone iOS ' + ((ua.match(/OS (\d+)[_.](\d+)/) || []).slice(1).join('.') || '?')
    : api.platform === 'android' ? 'Android ' + ((ua.match(/Android ([\d.]+)/) || [])[1] || '?')
    : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Masaüstü';
  return os.slice(0, 60);
}

function feedbackForm(kind = 'oneri') {
  const email = (typeof SYNC !== 'undefined' && SYNC.user?.email) || '';
  openModal({
    title: 'Öneri ve sorun bildir',
    submit: 'Gönder',
    body: `
      <div class="seg seg3">
        ${Object.entries(FB_KINDS).map(([k, t]) => `<input type="radio" name="kind" id="fb-${k}" value="${k}" ${k === kind ? 'checked' : ''}><label for="fb-${k}">${t}</label>`).join('')}
      </div>
      <label class="field"><span id="fbLabel">Ne olsa güzel olur?</span>
        <textarea class="input" name="message" rows="6" maxlength="4000" required minlength="3" placeholder="Aklındakini yaz"></textarea></label>
      <label class="field"><span>Sana nasıl dönelim? (isteğe bağlı)</span>
        <input class="input" name="contact" maxlength="200" value="${esc(email)}" placeholder="E-posta adresin"></label>
      <label class="check"><input type="checkbox" name="withInfo" checked><span>Uygulama sürümü ve cihaz bilgisi eklensin <span class="muted">(${esc(S.version || '?')}, ${esc(deviceLabel())})</span></span></label>
      <p class="muted" style="margin:0;font-size:12.5px">Finansal kayıtların gönderilmez. Sadece yazdığın mesaj ve seçtiğin bilgiler gider.</p>
      <div id="fbMsg" class="muted" style="font-size:13px"></div>`,
    onOpen: f => {
      const hints = { oneri: ['Ne olsa güzel olur?', 'Aklındakini yaz'], sorun: ['Ne oldu?', 'Ne yaparken oldu, ne bekliyordun, ne oldu?'], diger: ['Mesajın', 'Aklındakini yaz'] };
      const upd = () => { const k = val(f, 'kind'); $('#fbLabel').textContent = hints[k][0]; f.elements.message.placeholder = hints[k][1]; };
      $$('input[name=kind]', f).forEach(r => r.addEventListener('change', upd)); upd();
      setTimeout(() => f.elements.message.focus(), 50);
    },
    onSubmit: f => {
      const row = {
        kind: val(f, 'kind'),
        message: val(f, 'message').trim().slice(0, 4000),
        contact: val(f, 'contact').trim().slice(0, 200) || null,
        app_version: f.elements.withInfo.checked ? String(S.version || '').slice(0, 40) || null : null,
        platform: f.elements.withInfo.checked ? deviceLabel() : null
      };
      if (row.message.length < 3) return fieldError(f, 'message', 'Biraz daha yaz');
      const btn = $('#modalFoot button[type=submit]'); btn.disabled = true; btn.textContent = 'Gönderiliyor…';
      (async () => {
        try {
          const cloud = typeof SYNC !== 'undefined' ? SYNC.cloud : null;
          if (!cloud?.sendFeedback) throw new Error('bağlantı yok');
          await cloud.sendFeedback(row);
          $('#modal').close();
          toast('Teşekkürler, mesajın ulaştı 🙏');
        } catch {
          btn.disabled = false; btn.textContent = 'Tekrar dene';
          $('#fbMsg').innerHTML = `Gönderilemedi. İnternet bağlantını kontrol et ya da <a href="#" id="fbMail">e-postayla gönder</a>.`;
          $('#fbMail').onclick = e => { e.preventDefault(); mailFeedback(row); };
        }
      })();
      return false;
    }
  });
}

function mailFeedback(row) {
  const subject = `Kuruşu Kuruşuna ${FB_KINDS[row.kind] || ''}`.trim();
  const body = `${row.message}\n\n---\n${row.app_version ? 'Sürüm: ' + row.app_version + '\n' : ''}${row.platform ? 'Cihaz: ' + row.platform + '\n' : ''}`;
  api.openUrl(`mailto:${FEEDBACK_MAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
}

Object.assign(ACTIONS, { 'feedback': el => feedbackForm(el.dataset.kind || 'oneri') });
