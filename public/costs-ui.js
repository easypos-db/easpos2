(() => {
  let managerPin = '', report = null, activeTab = 'report', rangeFrom = '', rangeTo = '', searches = { pro: '', sales: '', usage: '', recipes: '', semis: '', ingredients: '' };
  let proReport = null, proFilter = 'all', proLoading = false, proError = '';
  const proLink = 'https://docs.google.com/spreadsheets/d/1FzwL7yCvxnr4W1SPxIB3HETpR1edfiGpdiIa3JZa5aE/edit';
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
  const tabButtons = () => `<div class="cost-tabs" role="tablist"><button data-cost-tab="pro" class="${activeTab === 'pro' ? 'selected' : ''}">PRO Maliyetleri</button><button data-cost-tab="report" class="${activeTab === 'report' ? 'selected' : ''}">Tüketim Raporu</button><button data-cost-tab="recipes" class="${activeTab === 'recipes' ? 'selected' : ''}">Ürün Reçeteleri</button><button data-cost-tab="semis" class="${activeTab === 'semis' ? 'selected' : ''}">Yarı Mamüller</button><button data-cost-tab="ingredients" class="${activeTab === 'ingredients' ? 'selected' : ''}">Hammaddeler</button></div>`;
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
  async function loadPro(action = 'pro_costs', source) {
    if (proLoading) return;
    proLoading = true;
    proError = '';
    render();
    try { proReport = await request({action, source}); }
    catch (error) { proError = error.message; }
    finally { proLoading = false; if (activeTab === 'pro') render(); }
  }

  const renderPro = () => {
    const menu = new Map((report.recipes || []).map(product => [product.id,product]));
    const all = (proReport?.products || []).map(item => ({...item,...menu.get(item.id),lines:item.lines})).filter(item => item.name);
    const priced = all.filter(item => item.cost !== null).length;
    const visible = filterRows(all,'pro',item => item.name+' '+item.category).filter(item =>
      proFilter === 'all' || (proFilter === 'review' ? item.cost === null : item.source === proFilter));
    const captured = proReport?.capturedAt ? new Intl.DateTimeFormat('tr-TR',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(new Date(proReport.capturedAt)) : '';
    return `<section class="section pro-source">
      <div class="report-head"><div><h3>Easy Group PRO</h3><p class="fine">${captured ? 'Kaynak verisinin tarihi: '+esc(captured) : 'Henüz kaynak verisi yüklenmedi.'}
      ${proReport?.origin === 'file' ? ' · Dosya aktarımı' : proReport?.origin === 'google' ? ' · Google Sheets' : ''}</p></div>
      <a href="${proLink}" target="_blank" rel="noopener noreferrer">Tabloyu aç ↗</a></div>
      <div class="pro-source-actions">
        ${proReport?.connected ? `<button type="button" data-pro-action="refresh" ${proLoading?'disabled':''}>PRO’dan yenile</button>` : ''}
        <label class="pro-import">PRO dosyası yükle<input type="file" data-pro-import accept=".json,application/json" ${proLoading?'disabled':''}></label>
      </div>
      ${proReport && !proReport.connected ? '<p class="fine">Canlı Google bağlantısı kurulana kadar yeni verileri dosyadan yükleyebilirsin.</p>' : ''}
      ${proLoading ? '<p role="status">Maliyetler yükleniyor…</p>' : ''}
      ${proError || proReport?.refreshError ? `<p role="alert">${esc(proError || proReport.refreshError)}</p>` : ''}
    </section>
    ${all.length ? `<div class="stats pro-stats">
      ${statCard('Menü ürünü',String(all.length),'EasyPOS')}
      ${statCard('Maliyeti hazır',String(priced),'Reçete veya doğrulanmış fatura')}
      ${statCard('İnceleme bekleyen',String(all.length-priced),'Eşleşme ya da fatura birimi')}
    </div>
    <div class="pro-filters">${searchBox('pro','Ürün veya kategori ara…')}
      <select data-pro-filter aria-label="Maliyet kaynağı"><option value="all">Tüm ürünler</option><option value="recipe" ${proFilter==='recipe'?'selected':''}>Reçeteli ürünler</option><option value="invoice" ${proFilter==='invoice'?'selected':''}>İçecek faturaları</option><option value="review" ${proFilter==='review'?'selected':''}>İnceleme bekleyen</option></select>
    </div>
    <div class="pro-grid">${visible.map(item => `<article class="section pro-card">
      <div class="report-head"><div><small>${esc(item.category)}</small><h3>${esc(item.name)}</h3></div>
      <strong class="pro-amount">${item.cost === null ? '—' : money(item.cost/100)}</strong></div>
      <p class="fine">${item.source === 'invoice' ? 'Adet maliyeti · KDV hariç' : 'Porsiyon maliyeti · PRO'}</p>
      ${item.cost === null ? `<p class="pro-review">${esc(item.reason)}</p>` : ''}
      ${item.invoice ? `<details><summary>Fatura ayrıntısı</summary><p class="fine">${esc(item.invoice.date)} · ${esc(item.invoice.name)}<br>${item.invoice.price===null?'—':money(item.invoice.price/100)} / ${esc(item.invoice.unit)}${item.invoice.packageSize?' · '+item.invoice.packageSize+' adet':''}</p></details>` : ''}
      ${item.lines.length ? `<details><summary>${item.lines.length} reçete bileşeni</summary><ul>${item.lines.map(line=>`<li><span>${esc(line.name)}${line.quantity===null?'':' · '+esc(line.quantity)}</span><span>${line.cost===null?'—':money(line.cost/100)}</span></li>`).join('')}</ul></details>` : ''}
    </article>`).join('') || '<p class="fine">Bu filtreye uyan ürün yok.</p>'}</div>` : ''}`;
  };

  const render = () => {
    if (view !== 'costs') return;
    if (!report) return renderGate();
    app().classList.add('cost-erp-page');
    const panel = activeTab === 'pro' ? renderPro() : activeTab === 'report' ? renderReport() : activeTab === 'recipes' ? renderRecipes() : activeTab === 'semis' ? renderSemis() : renderIngredients();
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
    const tab = event.target.closest('[data-cost-tab]'); if (tab) { activeTab = tab.dataset.costTab; if(activeTab === 'pro')loadPro();else render(); }
    if(event.target.closest('[data-pro-action="refresh"]'))loadPro('pro_refresh');
    const productButton = event.target.closest('[data-edit-recipe]'); if (productButton) { const product = (report?.recipes || []).find(item => item.id === productButton.dataset.editRecipe); if (product) { activeTab = 'recipes'; editRecipe(product); } }
    const semiButton = event.target.closest('[data-edit-semi]'); if (semiButton) { const semi = (report?.subRecipes || []).find(item => item.id === semiButton.dataset.editSemi); if (semi) editSemi(semi); }
    const ingredientButton = event.target.closest('[data-edit-ingredient]'); if (ingredientButton) { const ingredient = (report?.ingredients || []).find(item => item.id === ingredientButton.dataset.editIngredient); if (ingredient) editIngredient(ingredient); }
    if (event.target.closest('[data-new-ingredient]')) editIngredient(null);
  });
  document.addEventListener('change', async event => {
    if (event.target.matches('[data-pro-filter]')) { proFilter = event.target.value; render(); return; }
    if (!event.target.matches('[data-pro-import]')) return;
    const file = event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 1000000) throw new Error('Dosya 1 MB’tan küçük olmalı.');
      await loadPro('pro_import',JSON.parse(await file.text()));
    } catch { proError = 'Geçerli bir Easy Group PRO JSON dosyası seç.'; render(); }
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
