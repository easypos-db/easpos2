(() => {
  let managerPin = '', report = null, activeTab = 'report', rangeFrom = '', rangeTo = '', searches = { sales: '', usage: '', recipes: '', semis: '', ingredients: '' };
  const app = () => document.getElementById('app');
  const dateInIstanbul = date => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const monthNow = () => dateInIstanbul(new Date()).slice(0, 7);
  const today = () => dateInIstanbul(new Date());
  const request = payload => api('costs', { ...payload, managerPin });
  const load = async (from = rangeFrom || `${monthNow()}-01`, to = rangeTo || today()) => {
    rangeFrom = from; rangeTo = to;
    report = await request({ action: 'snapshot', fromDate: from, toDate: to }); render();
  };
  const statCard = (label, value, note) => `<article class="stat"><label>${esc(label)}</label><strong>${esc(value)}</strong><small>${esc(note)}</small></article>`;
  const brandName = value => value === 'wingy' ? 'Easy Wingy' : value === 'mac' ? 'Easy Macaroni' : 'Easy Group';
  const quantity = (value, unit) => { const n = Number(value || 0), formatted = n.toLocaleString('tr-TR', { maximumFractionDigits: 3 }); if (unit === 'g' && n >= 1000) return `${formatted} g · ${(n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} kg`; if (unit === 'ml' && n >= 1000) return `${formatted} ml · ${(n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 2 })} lt`; return `${formatted} ${unit || ''}`.trim(); };
  const escHtml = value => esc(value);
  const searchBox = (key, placeholder) => `<input class="cost-search" data-search="${key}" type="search" value="${esc(searches[key])}" placeholder="${placeholder}" aria-label="${placeholder}">`;
  const filterRows = (rows, key, text) => rows.filter(row => text(row).toLocaleLowerCase('tr-TR').includes((searches[key] || '').toLocaleLowerCase('tr-TR')));
  const renderGate = () => { if (view !== 'costs') return; app().classList.add('cost-erp-page'); app().innerHTML = `<div class="heading"><div><h2>Reçete &amp; Tüketim.</h2><div class="sub">Dönem raporu, ürün reçeteleri ve mutfak formülleri.</div></div><button class="primary" data-cost="unlock">Müdür PIN’i ile aç</button></div><section class="section cost-lock-card"><span class="cost-eyebrow">YÖNETİCİ RAPORU</span><h3>Reçete ve tüketim raporu</h3><p class="fine">Raporu görüntülemek ve reçeteleri düzenlemek için müdür PIN’ini gir.</p><button class="primary" data-cost="unlock">Ekranı aç</button></section>`; };
  const tabButtons = () => `<div class="cost-tabs" role="tablist"><button data-cost-tab="report" class="${activeTab === 'report' ? 'selected' : ''}">Tüketim Raporu</button><button data-cost-tab="recipes" class="${activeTab === 'recipes' ? 'selected' : ''}">Ürün Reçeteleri</button><button data-cost-tab="semis" class="${activeTab === 'semis' ? 'selected' : ''}">Yarı Mamüller</button><button data-cost-tab="ingredients" class="${activeTab === 'ingredients' ? 'selected' : ''}">Hammaddeler</button></div>`;
  const renderReport = () => {
    const sales = filterRows(report.productSales || [], 'sales', row => `${row.name} ${brandName(row.brand)}`), usage = filterRows(report.ingredientConsumption || [], 'usage', row => row.name);
    return `<div class="stats cost-stats">${statCard('Kapanan sipariş', Number(report.orderCount || 0).toLocaleString('tr-TR'), `${rangeFrom} – ${rangeTo}`)}${statCard('Satılan ürün adedi', Number(report.soldUnits || 0).toLocaleString('tr-TR'), 'Seçilen tarih aralığı')}${statCard('Tüketilen hammadde', String((report.ingredientConsumption || []).length), 'Reçeteye göre kalem')}${statCard('Reçetesi eksik ürün', String((report.missingRecipes || []).length), 'Satılan ürünler içinde')}</div>
      ${(report.missingRecipes || []).length ? `<div class="cost-alert cost-alert-warn"><strong>Reçete tanımlanmamış</strong><div class="missing-recipe-list">${report.missingRecipes.map(name => { const product = (report.recipes || []).find(item => item.name === name); return `<button data-edit-recipe="${esc(product?.id || '')}">${esc(name)} <span>Reçete oluştur →</span></button>`; }).join('')}</div></div>` : ''}
      <div class="cost-grid recipe-report-grid"><section class="section"><div class="report-head"><div><span class="cost-eyebrow">SATIŞ</span><h3>Ürün adetleri</h3></div><span class="count">${sales.length} ürün</span></div>${searchBox('sales', 'Ürün adı veya marka ara…')}<div class="tablewrap"><table><thead><tr><th>Marka</th><th>Ürün</th><th>Satış adedi</th></tr></thead><tbody>${sales.map(row => `<tr><td>${esc(brandName(row.brand))}</td><td><strong>${esc(row.name)}</strong></td><td><strong>${Number(row.quantity).toLocaleString('tr-TR')}</strong></td></tr>`).join('') || '<tr><td colspan="3">Eşleşen satış bulunamadı.</td></tr>'}</tbody></table></div></section>
      <section class="section"><div class="report-head"><div><span class="cost-eyebrow">TÜKETİM</span><h3>Reçeteye göre hammadde</h3></div><span class="count">${usage.length} kalem</span></div>${searchBox('usage', 'Hammadde ara…')}<div class="tablewrap"><table><thead><tr><th>Hammadde</th><th>Toplam kullanım</th></tr></thead><tbody>${usage.map(row => `<tr><td><strong>${esc(row.name)}</strong></td><td>${quantity(row.quantity, row.unit)}</td></tr>`).join('') || '<tr><td colspan="2">Eşleşen hammadde bulunamadı.</td></tr>'}</tbody></table></div></section></div>`;
  };
  const renderRecipes = () => {
    const rows = filterRows(report.recipes || [], 'recipes', row => `${row.name} ${row.brand} ${row.category} ${row.lines.map(x => x.name).join(' ')}`);
    return `<div class="report-head"><div><span class="cost-eyebrow">MENÜ KATALOĞU</span><h3>Ürün reçeteleri</h3><p class="fine">Ürüne veya düzenle düğmesine dokunarak bileşen miktarlarını değiştir.</p></div><span class="count">${rows.length} ürün</span></div>${searchBox('recipes', 'Ürün veya bileşen ara…')}<div class="recipe-cards">${rows.map(product => `<button class="section recipe-card recipe-edit-card" data-edit-recipe="${esc(product.id)}"><div class="recipe-card-head"><div><span class="cost-eyebrow">${esc(brandName(product.brand))} · ${esc(product.category || 'Menü')}</span><h3>${esc(product.name)}</h3></div><span class="count">${product.lines.length} bileşen</span></div>${product.lines.length ? `<ul class="recipe-lines">${product.lines.map(line => `<li><span>${esc(line.name)}${line.type === 'semi' ? ' <small class="margin-pill">Yarı mamül</small>' : ''}</span><strong>${quantity(line.quantity, line.unit)}</strong></li>`).join('')}</ul>` : '<p class="fine">Reçete tanımlanmamış · eklemek için dokun</p>'}<span class="cost-edit-link">Düzenle →</span></button>`).join('') || '<p class="fine">Eşleşen ürün yok.</p>'}</div>`;
  };
  const renderSemis = () => {
    const rows = filterRows(report.subRecipes || [], 'semis', row => `${row.name} ${row.lines.map(x => x.name).join(' ')}`);
    return `<div class="report-head"><div><span class="cost-eyebrow">ÖN HAZIRLIK</span><h3>Yarı mamüller</h3><p class="fine">Yarı mamül verimi ve bileşen miktarlarını düzenle.</p></div><span class="count">${rows.length} reçete</span></div>${searchBox('semis', 'Yarı mamül veya bileşen ara…')}<div class="recipe-cards">${rows.map(semi => `<button class="section recipe-card recipe-edit-card" data-edit-semi="${esc(semi.id)}"><div class="recipe-card-head"><div><span class="cost-eyebrow">YARI MAMÜL · VERİM</span><h3>${esc(semi.name)}</h3></div><span class="count">${quantity(semi.yield, semi.unit)}</span></div>${semi.lines.length ? `<ul class="recipe-lines">${semi.lines.map(line => `<li><span>${esc(line.name)}</span><strong>${quantity(line.quantity, line.unit)}</strong></li>`).join('')}</ul>` : '<p class="fine">Bileşen tanımlanmamış.</p>'}<span class="cost-edit-link">Düzenle →</span></button>`).join('') || '<p class="fine">Eşleşen yarı mamül yok.</p>'}</div>`;
  };
  const renderIngredients = () => {
    const rows = filterRows(report.ingredients || [], 'ingredients', row => `${row.name} ${row.purchaseUnit} ${row.baseUnit}`);
    return `<div class="report-head"><div><span class="cost-eyebrow">HAMMADDE TANIMLARI</span><h3>Hammaddeler</h3><p class="fine">Ad ve satın alma birimini düzenle. Ölçü ailesi bağlı reçetelerde korunur.</p></div><button class="primary" data-new-ingredient>+ Hammadde ekle</button></div>${searchBox('ingredients', 'Hammadde adı veya birim ara…')}<div class="tablewrap"><table><thead><tr><th>Hammadde</th><th>Satın alma birimi</th><th>Reçete ölçüsü</th><th></th></tr></thead><tbody>${rows.map(item => `<tr><td><strong>${esc(item.name)}</strong></td><td>${esc(item.purchaseUnit)}</td><td>${esc(item.baseUnit)}</td><td><button data-edit-ingredient="${esc(item.id)}">Düzenle</button></td></tr>`).join('') || '<tr><td colspan="4">Eşleşen hammadde yok.</td></tr>'}</tbody></table></div>`;
  };
  const render = () => {
    if (view !== 'costs') return;
    if (!report) return renderGate();
    app().classList.add('cost-erp-page');
    const panel = activeTab === 'report' ? renderReport() : activeTab === 'recipes' ? renderRecipes() : activeTab === 'semis' ? renderSemis() : renderIngredients();
    app().innerHTML = `<div class="heading"><div><span class="cost-eyebrow">EASY GROUP · MUTFAK RAPORU</span><h2>Reçete &amp; Tüketim.</h2><div class="sub">D1 siparişleri ve kayıtlı reçeteler üzerinden hesaplanır.</div></div><button data-cost="refresh">Yenile</button></div>${tabButtons()}${activeTab === 'report' ? `<div class="cost-range"><label>Başlangıç<input id="costFrom" type="date" value="${esc(rangeFrom)}"></label><label>Bitiş<input id="costTo" type="date" value="${esc(rangeTo)}"></label><button data-range="today">Bugün</button><button data-range="week">Bu Hafta</button><button data-range="month">Bu Ay</button><button class="primary" data-cost="apply-range">Uygula</button></div>` : ''}<section class="section cost-tab-panel">${panel}</section>`;
    if (activeTab === 'report') {
      document.querySelector('[data-cost="apply-range"]').onclick = () => { const from = document.getElementById('costFrom').value, to = document.getElementById('costTo').value; if (!from || !to || from > to) { toast('Tarih aralığını kontrol et.', true); return; } load(from, to).catch(error => toast(error.message, true)); };
      document.querySelectorAll('[data-range]').forEach(button => button.onclick = () => { const end = today(); let start = end; if (button.dataset.range === 'month') start = `${end.slice(0, 7)}-01`; if (button.dataset.range === 'week') { const d = new Date(`${end}T12:00:00+03:00`), weekday = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - weekday); start = dateInIstanbul(d); } load(start, end).catch(error => toast(error.message, true)); });
    }
  };
  async function unlock() { const dialog = document.getElementById('managerPinDialog'); if (managerPin && report) { render(); return; } if (!dialog.open) { document.getElementById('managerPinInput').value = ''; document.getElementById('managerPinError').textContent = ''; dialog.showModal(); } }
  async function approvePin() { const pin = document.getElementById('managerPinInput').value; if (!/^\d{4}$/.test(pin)) { document.getElementById('managerPinError').textContent = '4 rakamlı müdür PIN’ini gir.'; return; } try { managerPin = pin; rangeFrom = `${monthNow()}-01`; rangeTo = today(); report = await request({ action: 'snapshot', fromDate: rangeFrom, toDate: rangeTo }); document.getElementById('managerPinDialog').close(); render(); } catch (error) { managerPin = ''; document.getElementById('managerPinError').textContent = error.message; } }
  const openEditor = (title, rows, options, onSave, extra = '') => {
    const dialog = document.createElement('dialog'); dialog.className = 'cost-edit-dialog'; dialog.innerHTML = `<form method="dialog" class="cost-edit-form"><div class="report-head"><div><span class="cost-eyebrow">D1 REÇETE TANIMI</span><h3>${title}</h3></div><button type="button" class="icon-close" data-close>×</button></div>${extra}<div class="cost-edit-lines"></div><button type="button" data-add-line>+ Bileşen ekle</button><div class="dialog-actions"><button type="button" data-close>Vazgeç</button><button type="submit" class="primary">Kaydet</button></div></form>`;
    const linesNode = dialog.querySelector('.cost-edit-lines');
    const addLine = line => { const row = document.createElement('div'); row.className = 'cost-edit-line'; row.innerHTML = `<select aria-label="Hammadde" required><option value="">Bileşen seç</option>${options.map(item => `<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.unit)}</option>`).join('')}</select><input aria-label="Miktar" type="number" min="0.001" step="0.001" inputmode="decimal" placeholder="Miktar" value="${line ? esc(line.quantity) : ''}" required><button type="button" aria-label="Satırı kaldır">×</button>`; if (line) row.querySelector('select').value = line.ingredientId; row.querySelector('button').onclick = () => row.remove(); linesNode.append(row); };
    rows.forEach(addLine); dialog.querySelector('[data-add-line]').onclick = () => addLine(); dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = () => dialog.close());
    dialog.querySelector('form').onsubmit = async event => { event.preventDefault(); const lines = [...linesNode.children].map(row => ({ ingredientId: row.querySelector('select').value, quantityBase: Number(row.querySelector('input').value) })); if (lines.some(line => !line.ingredientId || !Number.isFinite(line.quantityBase) || line.quantityBase <= 0)) { toast('Bileşen ve miktarları kontrol et.', true); return; } try { await onSave(lines, dialog); } catch (error) { toast(error.message, true); } };
    dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
  };
  const refreshAfterSave = async message => { await load(rangeFrom, rangeTo); toast(message); };
  const editRecipe = product => { const options = (report.components || []).filter(item => item.type !== 'product'); openEditor(escHtml(product.name), product.lines.map(line => ({ ingredientId: line.ingredientId, quantity: line.quantity })), options, async (lines, dialog) => { await request({ action: 'recipe_save', productId: product.id, lines }); dialog.close(); await refreshAfterSave('Ürün reçetesi kaydedildi.'); }); };
  const editSemi = semi => { const options = (report.components || []).filter(item => item.type === 'raw' && item.id !== semi.ingredientId); openEditor(escHtml(semi.name), semi.lines.map(line => ({ ingredientId: line.ingredientId, quantity: line.quantity })), options, async (lines, dialog) => { const yieldInput = dialog.querySelector('[name="yieldQuantity"]'); await request({ action: 'sub_recipe_save', id: semi.id, yieldQuantity: Number(yieldInput.value), lines }); dialog.close(); await refreshAfterSave('Yarı mamül reçetesi kaydedildi.'); }, `<label class="cost-field">Parti verimi · ${esc(semi.unit)}<input name="yieldQuantity" type="number" min="0.001" step="0.001" value="${esc(semi.yield)}" required></label>`); };
  const editIngredient = ingredient => { const dialog = document.createElement('dialog'); dialog.className = 'cost-edit-dialog'; dialog.innerHTML = `<form class="cost-edit-form"><div class="report-head"><div><span class="cost-eyebrow">HAMMADDE KARTI</span><h3>${ingredient ? 'Hammaddeyi düzenle' : 'Hammadde ekle'}</h3></div><button type="button" class="icon-close" data-close>×</button></div><label class="cost-field">Hammadde adı<input name="name" maxlength="100" required value="${esc(ingredient?.name || '')}"></label><label class="cost-field">Satın alma birimi<select name="purchaseUnit">${['kg','g','lt','ml','adet'].map(unit => `<option ${ingredient?.purchaseUnit === unit ? 'selected' : ''}>${unit}</option>`).join('')}</select></label><p class="fine">Reçetelerdeki miktarlar baz birimle (g, ml veya adet) tutulur. Kayıtlı reçetelerde ölçü ailesi değiştirilmez.</p><div class="dialog-actions"><button type="button" data-close>Vazgeç</button><button type="submit" class="primary">Kaydet</button></div></form>`;
    dialog.querySelectorAll('[data-close]').forEach(button => button.onclick = () => dialog.close()); dialog.querySelector('form').onsubmit = async event => { event.preventDefault(); try { await request({ action: 'ingredient_save', id: ingredient?.id, name: dialog.querySelector('[name="name"]').value, purchaseUnit: dialog.querySelector('[name="purchaseUnit"]').value }); dialog.close(); await refreshAfterSave('Hammadde kaydedildi.'); } catch (error) { toast(error.message, true); } }; dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
  };
  window.addEventListener('easypos-cost-view', () => { if (view === 'costs') unlock(); });
  document.querySelector('[data-cost="cancel-pin"]').addEventListener('click', () => document.getElementById('managerPinDialog').close());
  document.getElementById('managerPinForm').addEventListener('submit', event => { event.preventDefault(); approvePin(); });
  document.addEventListener('click', event => {
    if (event.target.closest('[data-cost="unlock"]')) unlock();
    if (event.target.closest('[data-cost="refresh"]')) load(rangeFrom, rangeTo).catch(error => toast(error.message, true));
    const tab = event.target.closest('[data-cost-tab]'); if (tab) { activeTab = tab.dataset.costTab; render(); }
    const productButton = event.target.closest('[data-edit-recipe]'); if (productButton) { const product = (report?.recipes || []).find(item => item.id === productButton.dataset.editRecipe); if (product) { activeTab = 'recipes'; editRecipe(product); } }
    const semiButton = event.target.closest('[data-edit-semi]'); if (semiButton) { const semi = (report?.subRecipes || []).find(item => item.id === semiButton.dataset.editSemi); if (semi) editSemi(semi); }
    const ingredientButton = event.target.closest('[data-edit-ingredient]'); if (ingredientButton) { const ingredient = (report?.ingredients || []).find(item => item.id === ingredientButton.dataset.editIngredient); if (ingredient) editIngredient(ingredient); }
    if (event.target.closest('[data-new-ingredient]')) editIngredient(null);
  });
  document.addEventListener('input', event => { const input = event.target.closest('[data-search]'); if (!input || view !== 'costs') return; searches[input.dataset.search] = input.value; const cursor = input.selectionStart, key = input.dataset.search; render(); const updated = document.querySelector(`[data-search="${key}"]`); if (updated) { updated.focus(); updated.setSelectionRange(cursor, cursor); } });
  const observer = new MutationObserver(() => {
    app().classList.toggle('cost-erp-page', view === 'costs');
    if (view !== 'team' || !isAdmin() || document.getElementById('managerPinSetup')) return;
    const heading = app().querySelector('.heading'); if (!heading) return;
    const section = document.createElement('section'); section.className = 'section manager-pin-setup'; section.id = 'managerPinSetup'; section.innerHTML = `<span class="cost-eyebrow">YÖNETİCİ ERİŞİMİ</span><h3>Reçete &amp; Tüketim PIN’i</h3><p class="fine">Raporu ve reçete düzenleme alanlarını açmak için 4 rakamlı bir PIN belirle veya değiştir.</p><form id="managerPinSetupForm"><label>4 haneli PIN<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" required autocomplete="new-password" placeholder="••••"></label><div class="cost-form-actions"><button class="primary">PIN’i kaydet</button></div></form>`; heading.after(section);
    section.querySelector('form').onsubmit = async event => { event.preventDefault(); const pin = new FormData(event.target).get('pin'); try { await api('team', { action: 'set_manager_pin', pin }); managerPin = ''; report = null; event.target.reset(); toast('Müdür PIN’i güncellendi.'); } catch (error) { toast(error.message, true); } };
  });
  observer.observe(document.getElementById('app'), { childList: true });
})();
(function () {
  if (window.__easyAddonsLoaded) return;
  window.__easyAddonsLoaded = true;

  function roundTL(tl, mode) {
    if (mode === "1") return Math.round(tl);
    if (mode === "5") return Math.round(tl / 5) * 5;
    if (mode === "10") return Math.round(tl / 10) * 10;
    return Math.round(tl * 100) / 100;
  }

  function injectUI() {
    // 1. Garson rolü aktifse sol menüyü sadece Masa sipariş ve Gel Al ile sınırla
    if (typeof me !== "undefined" && me && me.role === "waiter") {
      const nav = document.getElementById("nav");
      if (nav) {
        nav.querySelectorAll("button").forEach((btn) => {
          const tab = btn.getAttribute("data-tab") || btn.textContent || "";
          const allowed = tab.includes("Masa") || tab.includes("Gel Al") || tab === "tables" || tab === "pickup";
          if (!allowed) btn.style.display = "none";
        });
      }
    }

    // 2. Tanımlamalar > Menü ve Ürünler ekranına Toplu Fiyat Düzenle butonu ekle
    const addProdBtn = document.querySelector('[data-def-action="add-product"]');
    if (addProdBtn && !document.getElementById("openBulkPriceBtn")) {
      const bulkBtn = document.createElement("button");
      bulkBtn.type = "button";
      bulkBtn.id = "openBulkPriceBtn";
      bulkBtn.textContent = "Toplu Fiyat Düzenle";
      bulkBtn.style.cssText =
        "background:#fff7ed;color:#c2410c;border:1px solid #fdba74;padding:8px 14px;border-radius:10px;font-weight:600;cursor:pointer;margin-right:8px";
      addProdBtn.parentNode.insertBefore(bulkBtn, addProdBtn);
    }

    // 3. Ekip ve erişim ekranına Garson ekle kartı ekle
    const appEl = document.getElementById("app");
    if (
      appEl &&
      appEl.innerHTML.includes("Kurye ekle") &&
      !document.getElementById("waiterSectionCard")
    ) {
      const h3s = Array.from(appEl.querySelectorAll("h3"));
      const courierH3 = h3s.find((el) => el.textContent.trim() === "Kurye ekle");
      if (courierH3 && courierH3.closest(".section")) {
        const courierSec = courierH3.closest(".section");
        const waiterSec = document.createElement("div");
        waiterSec.id = "waiterSectionCard";
        waiterSec.className = "section";
        waiterSec.innerHTML = `
          <h3>Garson ekle</h3>
          <p class="fine">Garsonlar kendi kullanıcı adı ve 6 haneli PIN kodu ile giriş yapıp yalnızca Masa Sipariş ve Gel Al ekranlarını kullanabilir; kasa raporları, fiyatlar ve indirimlere erişemez.</p>
          <div class="grid two">
            <label><span>Ad soyad</span><input id="wName" placeholder="Örn: Ahmet"></label>
            <label><span>Kullanıcı adı</span><input id="wUser" placeholder="Örn: ahmet"></label>
          </div>
          <div class="grid two" style="margin-top:8px">
            <label><span>6 Haneli PIN</span><input id="wPin" type="password" inputmode="numeric" maxlength="6" placeholder="6 rakam (Örn: 123456)"></label>
            <div style="display:flex;align-items:flex-end">
              <button type="button" class="primary" id="wAddBtn">Garson ekle</button>
            </div>
          </div>
        `;
        courierSec.parentNode.insertBefore(waiterSec, courierSec);
      }
    }
  }

  function openBulkPriceModal() {
    const all = typeof definitionProducts === "function" ? definitionProducts() : [];
    if (!all || !all.length) {
      alert("Ürün listesi henüz yüklenmedi.");
      return;
    }
    const existing = document.getElementById("bpOverlay");
    if (existing) existing.remove();

    const cats = [...new Set(all.map((p) => p.category).filter(Boolean))];
    const ov = document.createElement("div");
    ov.id = "bpOverlay";
    ov.style.cssText =
      "position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
    ov.innerHTML = `
      <div style="background:#fff;border-radius:16px;max-width:780px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 20px 45px rgba(0,0,0,.22);overflow:hidden">
        <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <b style="font-size:16px">Toplu Fiyat Düzenleme ve Menü Kontrolü</b>
            <div style="font-size:12px;color:#64748b">Kategori/marka seçerek toplu zam-indirim yapın veya listeden fiyatları düzenleyip tek tuşla kaydedin.</div>
          </div>
          <button type="button" id="bpCloseX" style="border:0;background:#f1f5f9;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px">×</button>
        </div>
        <div style="padding:12px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
          <select id="bpCat" style="padding:7px;border:1px solid #cbd5e1;border-radius:8px">
            <option value="ALL">Tüm Kategoriler (${all.length})</option>
            ${cats.map((c) => `<option value="${c}">${c}</option>`).join("")}
          </select>
          <select id="bpBrand" style="padding:7px;border:1px solid #cbd5e1;border-radius:8px">
            <option value="ALL">Tüm Markalar</option>
            <option value="wingy">Easy Wingy</option>
            <option value="mac">Easy Macaroni</option>
          </select>
          <select id="bpType" style="padding:7px;border:1px solid #cbd5e1;border-radius:8px">
            <option value="pct">Yüzde (%) +/-</option>
            <option value="flat">Sabit Tutar (₺) +/-</option>
          </select>
          <input id="bpVal" type="number" step="any" placeholder="Örn: 15 veya -10" style="width:130px;padding:7px;border:1px solid #cbd5e1;border-radius:8px">
          <select id="bpRound" style="padding:7px;border:1px solid #cbd5e1;border-radius:8px">
            <option value="1">Tam 1 ₺</option>
            <option value="5">5 ₺ Katına</option>
            <option value="10">10 ₺ Katına</option>
            <option value="none">Yuvarlama Yok</option>
          </select>
          <button type="button" id="bpApplyBtn" style="background:#0f172a;color:#fff;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600">Uygula</button>
        </div>
        <div id="bpTableWrap" style="padding:12px 20px;overflow-y:auto;flex:1"></div>
        <div style="padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center">
          <span id="bpStatus" style="font-size:13px;color:#475569">0 üründe değişiklik var</span>
          <div>
            <button type="button" id="bpCancelBtn" style="padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;margin-right:6px;cursor:pointer">Vazgeç</button>
            <button type="button" id="bpSaveBtn" style="padding:8px 16px;border:0;background:#ea580c;color:#fff;font-weight:600;border-radius:8px;cursor:pointer">Tüm Değişiklikleri Kaydet</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(ov);

    const state = all.map((p) => ({
      id: p.id,
      name: p.name,
      cat: p.category,
      br: p.brand || "wingy",
      orig: Number(p.ysPrice || 0),
      curr: Number(p.ysPrice || 0),
    }));

    function drawTable() {
      const c = document.getElementById("bpCat").value;
      const b = document.getElementById("bpBrand").value;
      const filtered = state.filter((x) => (c === "ALL" || x.cat === c) && (b === "ALL" || x.br === b));
      document.getElementById("bpStatus").textContent =
        state.filter((x) => x.curr !== x.orig).length + " üründe fiyat değişikliği var";

      document.getElementById("bpTableWrap").innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <thead>
            <tr style="text-align:left;border-bottom:2px solid #e2e8f0;color:#64748b">
              <th style="padding:6px 4px">Ürün</th>
              <th style="padding:6px 4px">Kategori</th>
              <th style="padding:6px 4px">Mevcut</th>
              <th style="padding:6px 4px">Yeni Fiyat (₺)</th>
            </tr>
          </thead>
          <tbody>
            ${filtered
              .map(
                (x) => `
              <tr style="border-bottom:1px solid #f1f5f9;background:${x.curr !== x.orig ? "#fff7ed" : ""}">
                <td style="padding:6px 4px;font-weight:500">${x.name}</td>
                <td style="padding:6px 4px;color:#64748b">${x.cat}</td>
                <td style="padding:6px 4px">₺${(x.orig / 100).toFixed(2)}</td>
                <td style="padding:6px 4px">
                  <input data-bp-id="${x.id}" type="number" step="0.5" value="${(x.curr / 100).toFixed(2)}" style="width:105px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;font-weight:600">
                </td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;

      ov.querySelectorAll("input[data-bp-id]").forEach((inp) => {
        inp.oninput = () => {
          const item = state.find((z) => z.id === inp.getAttribute("data-bp-id"));
          const val = Math.round(parseFloat(inp.value || "0") * 100);
          if (item && val >= 100) item.curr = val;
          document.getElementById("bpStatus").textContent =
            state.filter((z) => z.curr !== z.orig).length + " üründe fiyat değişikliği var";
        };
      });
    }

    document.getElementById("bpCat").onchange = drawTable;
    document.getElementById("bpBrand").onchange = drawTable;
    document.getElementById("bpApplyBtn").onclick = () => {
      const c = document.getElementById("bpCat").value;
      const b = document.getElementById("bpBrand").value;
      const t = document.getElementById("bpType").value;
      const v = parseFloat(document.getElementById("bpVal").value || "0");
      const r = document.getElementById("bpRound").value;
      if (!v) return;
      state.forEach((x) => {
cd "/Users/melih/Downloads/easypos" && cat << 'EOF' > public/addons.js
(function () {
  if (window.__easyAddonsLoaded) return;
  window.__easyAddonsLoaded = true;
  function roundTL(tl, mode) {
    if (mode === "1") return Math.round(tl);
    if (mode === "5") return Math.round(tl / 5) * 5;
    if (mode === "10") return Math.round(tl / 10) * 10;
    return Math.round(tl * 100) / 100;
  }
  function injectUI() {
    if (typeof me !== "undefined" && me && me.role === "waiter") {
      const nav = document.getElementById("nav");
      if (nav) {
        nav.querySelectorAll("button").forEach((btn) => {
          const tab = btn.getAttribute("data-tab") || btn.textContent || "";
          const allowed = tab.includes("Masa") || tab.includes("Gel Al") || tab === "tables" || tab === "pickup";
          if (!allowed) btn.style.display = "none";
        });
      }
    }
    const addProdBtn = document.querySelector('[data-def-action="add-product"]');
    if (addProdBtn && !document.getElementById("openBulkPriceBtn")) {
      const bulkBtn = document.createElement("button");
      bulkBtn.type = "button";
      bulkBtn.id = "openBulkPriceBtn";
      bulkBtn.textContent = "Toplu Fiyat Düzenle";
      bulkBtn.style.cssText = "background:#fff7ed;color:#c2410c;border:1px solid #fdba74;padding:8px 14px;border-radius:10px;font-weight:600;cursor:pointer;margin-right:8px";
      addProdBtn.parentNode.insertBefore(bulkBtn, addProdBtn);
    }
    const appEl = document.getElementById("app");
    if (appEl && appEl.innerHTML.includes("Kurye ekle") && !document.getElementById("waiterSectionCard")) {
      const h3s = Array.from(appEl.querySelectorAll("h3"));
      const courierH3 = h3s.find((el) => el.textContent.trim() === "Kurye ekle");
      if (courierH3 && courierH3.closest(".section")) {
        const courierSec = courierH3.closest(".section");
        const waiterSec = document.createElement("div");
        waiterSec.id = "waiterSectionCard";
        waiterSec.className = "section";
        waiterSec.innerHTML = '<h3>Garson ekle</h3><p class="fine">Garsonlar kendi kullanıcı adı ve 6 haneli PIN kodu ile giriş yapıp yalnızca Masa Sipariş ve Gel Al ekranlarını kullanabilir.</p><div class="grid two"><label><span>Ad soyad</span><input id="wName" placeholder="Örn: Ahmet"></label><label><span>Kullanıcı adı</span><input id="wUser" placeholder="Örn: ahmet"></label></div><div class="grid two" style="margin-top:8px"><label><span>6 Haneli PIN</span><input id="wPin" type="password" inputmode="numeric" maxlength="6" placeholder="6 rakam (Örn: 123456)"></label><div style="display:flex;align-items:flex-end"><button type="button" class="primary" id="wAddBtn">Garson ekle</button></div></div>';
        courierSec.parentNode.insertBefore(waiterSec, courierSec);
      }
    }
  }
  function openBulkPriceModal() {
    const all = typeof definitionProducts === "function" ? definitionProducts() : [];
    if (!all || !all.length) return alert("Ürün listesi henüz yüklenmedi.");
    document.getElementById("bpOverlay")?.remove();
    const cats = [...new Set(all.map((p) => p.category).filter(Boolean))];
    const ov = document.createElement("div");
    ov.id = "bpOverlay";
    ov.style.cssText = "position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
    ov.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:780px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden"><div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center"><b>Toplu Fiyat Düzenleme ve Menü Kontrolü</b><button type="button" id="bpCloseX" style="border:0;background:#f1f5f9;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px">×</button></div><div style="padding:12px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:8px;align-items:center"><select id="bpCat" style="padding:7px;border:1px solid #cbd5e1;border-radius:8px"><option value="ALL">Tüm Kategoriler (' + all.length + ')</option>' + cats.map((c) => '<option value="' + c + '">' + c + '</option>').join("") + '</select><select id="bpBrand" style="padding:7px;border:1px solid #cbd5e1;border-radius:8px"><option value="ALL">Tüm Markalar</option><option value="wingy">Easy Wingy</option><option value="mac">Easy Macaroni</option></select><select id="bpType" style="padding:7px;border:1px solid #cbd5e1;border-radius:8px"><option value="pct">Yüzde (%) +/-</option><option value="flat">Sabit Tutar (₺) +/-</option></select><input id="bpVal" type="number" step="any" placeholder="Örn: 15 veya -10" style="width:130px;padding:7px;border:1px solid #cbd5e1;border-radius:8px"><select id="bpRound" style="padding:7px;border:1px solid #cbd5e1;border-radius:8px"><option value="1">Tam 1 ₺</option><option value="5">5 ₺ Katına</option><option value="10">10 ₺ Katına</option><option value="none">Yuvarlama Yok</option></select><button type="button" id="bpApplyBtn" style="background:#0f172a;color:#fff;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600">Uygula</button></div><div id="bpTableWrap" style="padding:12px 20px;overflow-y:auto;flex:1"></div><div style="padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center"><span id="bpStatus" style="font-size:13px;color:#475569">0 değişiklik</span><div><button type="button" id="bpCancelBtn" style="padding:8px 14px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;margin-right:6px;cursor:pointer">Vazgeç</button><button type="button" id="bpSaveBtn" style="padding:8px 16px;border:0;background:#ea580c;color:#fff;font-weight:600;border-radius:8px;cursor:pointer">Tüm Değişiklikleri Kaydet</button></div></div></div>';
    document.body.appendChild(ov);
    const state = all.map((p) => ({ id: p.id, name: p.name, cat: p.category, br: p.brand || "wingy", orig: Number(p.ysPrice || 0), curr: Number(p.ysPrice || 0) }));
    function drawTable() {
      const c = document.getElementById("bpCat").value, b = document.getElementById("bpBrand").value;
      const filtered = state.filter((x) => (c === "ALL" || x.cat === c) && (b === "ALL" || x.br === b));
      document.getElementById("bpStatus").textContent = state.filter((x) => x.curr !== x.orig).length + " üründe değişiklik var";
      document.getElementById("bpTableWrap").innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr style="text-align:left;border-bottom:2px solid #e2e8f0;color:#64748b"><th style="padding:6px 4px">Ürün</th><th style="padding:6px 4px">Kategori</th><th style="padding:6px 4px">Mevcut</th><th style="padding:6px 4px">Yeni Fiyat (₺)</th></tr></thead><tbody>' + filtered.map((x) => '<tr style="border-bottom:1px solid #f1f5f9;background:' + (x.curr !== x.orig ? "#fff7ed" : "") + '"><td style="padding:6px 4px;font-weight:500">' + x.name + '</td><td style="padding:6px 4px;color:#64748b">' + x.cat + '</td><td style="padding:6px 4px">₺' + (x.orig / 100).toFixed(2) + '</td><td style="padding:6px 4px"><input data-bp-id="' + x.id + '" type="number" step="0.5" value="' + (x.curr / 100).toFixed(2) + '" style="width:105px;padding:5px 8px;border:1px solid #cbd5e1;border-radius:6px;font-weight:600"></td></tr>').join("") + '</tbody></table>';
      ov.querySelectorAll("input[data-bp-id]").forEach((inp) => {
        inp.oninput = () => {
          const item = state.find((z) => z.id === inp.getAttribute("data-bp-id"));
          const val = Math.round(parseFloat(inp.value || "0") * 100);
          if (item && val >= 100) item.curr = val;
          document.getElementById("bpStatus").textContent = state.filter((z) => z.curr !== z.orig).length + " üründe değişiklik var";
        };
      });
    }
    document.getElementById("bpCat").onchange = drawTable;
    document.getElementById("bpBrand").onchange = drawTable;
    document.getElementById("bpApplyBtn").onclick = () => {
      const c = document.getElementById("bpCat").value, b = document.getElementById("bpBrand").value, t = document.getElementById("bpType").value, v = parseFloat(document.getElementById("bpVal").value || "0"), r = document.getElementById("bpRound").value;
      if (!v) return;
      state.forEach((x) => { if ((c === "ALL" || x.cat === c) && (b === "ALL" || x.br === b)) { let tl = x.orig / 100; tl = t === "pct" ? tl * (1 + v / 100) : tl + v; x.curr = Math.round(roundTL(Math.max(1, tl), r) * 100); } });
      drawTable();
    };
    document.getElementById("bpCloseX").onclick = document.getElementById("bpCancelBtn").onclick = () => ov.remove();
    document.getElementById("bpSaveBtn").onclick = async () => {
      const changes = state.filter((x) => x.curr !== x.orig).map((x) => ({ id: x.id, ysPrice: x.curr }));
      if (!changes.length) return alert("Kaydedilecek fiyat değişikliği yok.");
      const btn = document.getElementById("bpSaveBtn"); btn.disabled = true; btn.textContent = "Kaydediliyor...";
      try {
        const res = await fetch("api/menu/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "bulk_price_update", items: changes }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Kayıt hatası");
        ov.remove();
        if (typeof sync === "function") await sync(true); else location.reload();
      } catch (err) { alert(err.message || "Hata oluştu"); btn.disabled = false; btn.textContent = "Tüm Değişiklikleri Kaydet"; }
    };
    drawTable();
  }
  document.addEventListener("click", async function (e) {
    if (e.target && e.target.id === "openBulkPriceBtn") openBulkPriceModal();
    if (e.target && e.target.id === "wAddBtn") {
      const name = document.getElementById("wName").value.trim(), username = document.getElementById("wUser").value.trim(), pin = document.getElementById("wPin").value.trim();
      if (!name || !username || !/^[0-9]{6}$/.test(pin)) return alert("Garson adı, kullanıcı adı ve 6 haneli rakam PIN girin.");
      e.target.disabled = true;
      try {
        const res = await fetch("api/members", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "add_waiter", name, username, pin }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Eklenemedi");
        if (typeof toast === "function") toast("Garson hesabı oluşturuldu.");
        if (typeof sync === "function") await sync(true); else location.reload();
      } catch (err) { alert(err.message || "Hata"); e.target.disabled = false; }
    }
  });
  setInterval(injectUI, 400);
})();
