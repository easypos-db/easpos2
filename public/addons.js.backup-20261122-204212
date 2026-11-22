(function () {
  if (window.__easyAddonsLoadedV2) return;
  window.__easyAddonsLoadedV2 = true;

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
  injectUI();
  const appRoot = document.getElementById("app");
  if (appRoot) new MutationObserver(() => injectUI()).observe(appRoot, { childList: true, subtree: true });
  setInterval(injectUI, 1200);
})();
