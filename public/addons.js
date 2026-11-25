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
        waiterSec.innerHTML = `
          <h3>Garson ekle</h3>
          <p class="fine">Garsonlar kullanıcı adı ve 6 haneli PIN ile giriş yapar. Ekip listesinden hesabı pasife alabilir veya yeniden etkinleştirebilirsin.</p>
          <form id="waiterForm">
            <div class="form-grid">
              <label>Ad soyad<input id="wName" name="name" maxlength="70" required placeholder="Garson adı"></label>
              <label>Kullanıcı adı<input id="wUser" name="username" pattern="[a-z0-9_]{3,30}" maxlength="30" required placeholder="kullanici_adi"></label>
              <label>6 haneli PIN<input id="wPin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" required autocomplete="new-password" placeholder="6 rakam"></label>
            </div>
            <div class="form-actions"><button type="button" class="primary" id="wAddBtn">Garson ekle</button></div>
          </form>
        `;
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
        if (typeof loadTeam === "function") await loadTeam(); else if (typeof sync === "function") await sync(true); else location.reload();
      } catch (err) { alert(err.message || "Hata"); e.target.disabled = false; }
    }
  });
  setInterval(injectUI, 400);
})();

;(function(){
  const st = document.createElement("style");
  st.textContent = `
    .printer-side-card, .printer-side-card > div {
      background: #ffffff !important;
      color: #0f172a !important;
      border: 1px solid #cbd5e1 !important;
      backdrop-filter: none !important;
      box-shadow: 0 4px 14px rgba(15,23,42,.08) !important;
    }
    .printer-side-card *, .printer-side-card h3, .printer-side-card p, .printer-side-card small, .printer-side-card label, .printer-side-card span {
      color: #0f172a !important;
      opacity: 1 !important;
    }
    .printer-side-card a, .printer-side-card button.primary {
      color: #ffffff !important;
    }
    .printer-side-card a[href*="print-bridge"] {
      color: #c2410c !important;
      font-weight: 700 !important;
    }
  `;
  document.head.appendChild(st);

  setInterval(() => {
    const link = document.querySelector('a[href="/print-bridge.js"]');
    if (link && !document.getElementById("winBridgeDl")) {
      const winBtn = document.createElement("a");
      winBtn.id = "winBridgeDl";
      winBtn.href = "/print-bridge-windows.bat";
      winBtn.download = "print-bridge-windows.bat";
      winBtn.textContent = " • Windows Başlatıcı İndir (.bat)";
      winBtn.style.cssText = "color:#0f172a!important;font-weight:700;text-decoration:underline;margin-left:6px";
      link.parentNode.insertBefore(winBtn, link.nextSibling);
    }
  }, 500);
})();

;(function(){
  setInterval(() => {
    const app = document.getElementById("app");
    if (!app) return;
    const text = app.innerText || "";
    const isOrderModal = text.includes("AKTİF ADİSYON") || text.includes("Adisyon #") || text.includes("Sipariş #");
    const isTable = text.includes("Masa / tür Masa") || /Masa\s+[1-9]\b/.test(text);
    const idMatch = text.match(/(?:Adisyon|Sipariş no|Sipariş)\s*#?(\d+)/i);
    if (!isOrderModal || isTable || !idMatch || document.getElementById("reprintTicketBtn")) return;

    const orderId = Number(idMatch.at(1));
    if (!orderId) return;

    const actionBars = Array.from(app.querySelectorAll("button")).filter(b =>
      ["KAYDET", "Vazgeç", "Kapat", "Hazırlanıyor", "Hazır", "Teslim Edildi"].includes(b.textContent.trim())
    );
    const anchor = actionBars.at(0);
    if (!anchor || !anchor.parentNode) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "reprintTicketBtn";
    btn.textContent = "FİŞİ YAZDIR";
    btn.style.cssText = "background:#0f172a;color:#fff;border:0;padding:8px 14px;border-radius:10px;font-weight:700;cursor:pointer;margin-right:8px";
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = "Yazdırılıyor...";
      try {
        const res = await fetch("api/printers/manage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "queue_order", id: orderId, type: "Adisyon" })
        });
        if (!res.ok) throw new Error("Yazdırma kuyruğuna eklenemedi");
        if (typeof toast === "function") toast("Adisyon fişi Kasa yazıcısına gönderildi.");
      } catch (e) {
        alert(e.message || "Hata oluştu");
      } finally {
        btn.disabled = false;
        btn.textContent = "FİŞİ YAZDIR";
      }
    };
    anchor.parentNode.insertBefore(btn, anchor);
  }, 600);
})();

;(function(){
  if (window.__easyAdisyoV4) return;
  window.__easyAdisyoV4 = true;
  var st = document.createElement("style");
  st.textContent = ".board{display:grid!important;grid-template-columns:repeat(4,minmax(255px,1fr))!important;gap:12px!important;align-items:start!important}.column{background:#f8fafc!important;border:1px solid #e2e8f0!important;border-radius:14px!important;padding:10px!important}.column-title{background:#fff!important;border:1px solid #e2e8f0!important;border-radius:10px!important;padding:9px 12px!important;margin-bottom:10px!important;font-weight:700!important;color:#0f172a!important}.card.order-card-open{background:#fff!important;border:1px solid #e2e8f0!important;border-radius:12px!important;padding:12px!important;margin-bottom:10px!important;box-shadow:0 2px 6px rgba(15,23,42,.04)!important}.ad-head{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}.ad-badge{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:13px;flex-shrink:0}.ad-bar{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px;padding-top:8px;border-top:1px solid #f1f5f9}.ad-ico-btn{background:#f8fafc!important;border:1px solid #e2e8f0!important;border-radius:8px!important;padding:6px 4px!important;font-size:14px!important;cursor:pointer!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;color:#334155!important}.ad-ico-btn.primary-act{background:#fff7ed!important;border-color:#fdba74!important;color:#c2410c!important}";
  document.head.appendChild(st);
  function pBadge(p){return p==="Yemeksepeti"?{ch:"Y",bg:"#fa0050"}:p==="Trendyol"?{ch:"T",bg:"#f27a1a"}:p==="Getir"?{ch:"G",bg:"#5d3ebc"}:{ch:"R",bg:"#0f172a"}}
  function renderAdisyoCards(){
    if(typeof state==="undefined"||!state||!Array.isArray(state.orders))return;
    document.querySelectorAll(".card.order-card-open[data-order-open]").forEach(function(el){
      if(el.dataset.adDone==="1")return;
      var id=Number(el.getAttribute("data-order-open")),o=state.orders.find(function(x){return Number(x.id)===id});
      if(!o)return; el.dataset.adDone="1";
      var pl=pBadge(o.platform),mins=Math.max(0,Math.floor((Date.now()-Number(o.created||Date.now()))/60000));
      var hh=String(Math.floor(mins/60)).padStart(2,"0"),mm=String(mins%60).padStart(2,"0");
      var brandLabel=o.brand==="mac"?"Easy Macaroni":o.brand==="mixed"?"Easy Wingy & Macaroni":"Easy Wingy";
      var typeLabel=o.serviceType==="pickup"?"Gel Al":o.serviceType==="table"?"Masa "+(o.tableNo||""):"Paket Servis";
      var cName=typeof person==="function"&&o.courierId?person(o.courierId):"";
      var actBtn="<button type=\"button\" class=\"ad-ico-btn\" disabled>✓</button>";
      if(o.stage===0||o.stage===1)actBtn="<button type=\"button\" class=\"ad-ico-btn primary-act\" title=\"Hazırlandı\" data-ad-ready=\""+o.id+"\">✓</button>";
      else if(o.stage===2&&o.serviceType==="package")actBtn="<button type=\"button\" class=\"ad-ico-btn primary-act\" title=\"Kurye Seç\" data-ad-courier=\""+o.id+"\">🛵</button>";
      else if(o.stage===3||(o.stage===2&&o.serviceType!=="package"))actBtn="<button type=\"button\" class=\"ad-ico-btn primary-act\" title=\"Teslim Edildi\" data-ad-deliver=\""+o.id+"\">✓</button>";
      var midBtn=(o.serviceType==="package"&&o.stage<4)?"<button type=\"button\" class=\"ad-ico-btn\" title=\"Çoklu Paket Kurye Ata\" data-ad-courier=\""+o.id+"\">🛵</button>":"<button type=\"button\" class=\"ad-ico-btn\" title=\"Mutfak Fişi\" data-ad-kitchen=\""+o.id+"\">🍳</button>";
      el.innerHTML="<div class=\"ad-head\"><div style=\"display:flex;align-items:center;gap:8px;min-width:0\"><span class=\"ad-badge\" style=\"background:"+pl.bg+"\">"+pl.ch+"</span><div style=\"min-width:0\"><div style=\"font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">"+(o.customer||"Müşteri")+"</div><div style=\"font-size:11px;color:#64748b\">"+hh+":"+mm+" dk · "+typeLabel+"</div></div></div><b style=\"color:#0f172a;font-size:13px\">#"+o.id+"</b></div><div style=\"font-size:12px;color:#334155;margin:4px 0\">🏪 "+brandLabel+"</div><div style=\"display:flex;justify-content:space-between;align-items:center;margin:6px 0;font-size:12px\"><span style=\"color:#dc2626;font-weight:600\">"+(o.payment||"Nakit")+"</span><strong style=\"font-size:14px;color:#0f172a\">₺"+Number(o.total||0).toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2})+"</strong></div><div style=\"font-size:11px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis\">"+(o.area||"")+"</div>"+(cName?"<div style=\"margin-top:6px;font-size:11px;font-weight:700;color:#0369a1;background:#f0f9ff;padding:4px 8px;border-radius:6px\">🛵 "+cName+"</div>":"")+"<div class=\"ad-bar\"><button type=\"button\" class=\"ad-ico-btn\" title=\"Adisyon Aç\" data-ad-open=\""+o.id+"\">📄</button><button type=\"button\" class=\"ad-ico-btn\" title=\"Fiş Yazdır\" data-ad-print=\""+o.id+"\">🖨️</button>"+midBtn+actBtn+"</div>";
    });
  }
  function openCourierModal(firstId){
    var old=document.getElementById("adCourierOv"); if(old)old.remove();
    var pkgs=(state&&state.orders?state.orders:Array.of()).filter(function(o){return o.serviceType==="package"&&(o.stage===1||o.stage===2)&&!o.courierId});
    var list=typeof couriers==="function"?couriers():Array.of(),sel=new Set(Array.of(Number(firstId))),chosen=list.at(0)?list.at(0).id:"";
    var ov=document.createElement("div"); ov.id="adCourierOv";
    ov.style.cssText="position:fixed;inset:0;background:rgba(15,23,42,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px";
    var cRows=list.map(function(c){var busy=(state&&state.orders?state.orders:Array.of()).some(function(x){return x.courierId===c.id&&x.stage===3});return "<label style=\"display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer\"><span style=\"display:flex;align-items:center;gap:8px\"><input type=\"radio\" name=\"adCRad\" value=\""+c.id+"\" "+(c.id===chosen?"checked":"")+"><b>"+c.name+"</b></span><span style=\"font-size:11px;font-weight:700;padding:2px 8px;border-radius:99px;background:"+(busy?"#fef2f2;color:#dc2626":"#f0fdf4;color:#16a34a")+"\">"+(busy?"Teslimatta":"Müsait")+"</span></label>"}).join("")||"<div style=\"padding:12px\">Kurye yok</div>";
    var pRows=pkgs.map(function(o){return "<label style=\"display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #f1f5f9;cursor:pointer\"><div><div style=\"font-weight:700;font-size:13px\">#"+o.id+" "+o.customer+"</div><div style=\"font-size:11px;color:#64748b\">"+(o.area||"")+"</div></div><input type=\"checkbox\" data-ad-pkg=\""+o.id+"\" "+(sel.has(Number(o.id))?"checked":"")+" style=\"width:18px;height:18px;accent-color:#dc2626\"></label>"}).join("");
    ov.innerHTML="<div style=\"background:#fff;border-radius:16px;max-width:820px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden\"><div style=\"padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center\"><div><b style=\"font-size:16px\">Kurye Seç ve Teslimata Çıkar</b><div style=\"font-size:12px;color:#64748b\">Birden fazla paketi tek seferde seçin</div></div><button type=\"button\" id=\"adCClose\" style=\"border:0;background:#f1f5f9;width:32px;height:32px;border-radius:8px;cursor:pointer;font-size:18px\">×</button></div><div style=\"display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 20px;overflow-y:auto\"><div><div style=\"font-weight:700;font-size:13px;margin-bottom:8px\">1. Kurye Seçin</div><div style=\"border:1px solid #e2e8f0;border-radius:10px\">"+cRows+"</div></div><div><div style=\"font-weight:700;font-size:13px;margin-bottom:8px\">2. Paketler (<span id=\"adSCnt\">1</span> Seçili)</div><div style=\"border:1px solid #e2e8f0;border-radius:10px;max-height:300px;overflow-y:auto\">"+pRows+"</div></div></div><div style=\"padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;justify-content:flex-end;gap:8px;background:#f8fafc\"><button type=\"button\" id=\"adCCancel\" style=\"padding:9px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:10px;cursor:pointer\">Vazgeç</button><button type=\"button\" id=\"adCGo\" style=\"padding:9px 18px;border:0;background:#dc2626;color:#fff;font-weight:700;border-radius:10px;cursor:pointer\">Teslimata Çıkar</button></div></div>";
    document.body.appendChild(ov);
    ov.querySelectorAll("input[name=\"adCRad\"]").forEach(function(r){r.onchange=function(){chosen=r.value}});
    ov.querySelectorAll("input[data-ad-pkg]").forEach(function(cb){cb.onchange=function(){var pid=Number(cb.getAttribute("data-ad-pkg"));if(cb.checked)sel.add(pid);else sel.delete(pid);document.getElementById("adSCnt").textContent=String(sel.size)}});
    document.getElementById("adCClose").onclick=document.getElementById("adCCancel").onclick=function(){ov.remove()};
    document.getElementById("adCGo").onclick=async function(){
      if(!chosen)return alert("Kurye seçin."); if(!sel.size)return alert("Paket seçin.");
      var b=document.getElementById("adCGo"); b.disabled=true; b.textContent="Atanıyor...";
      try{for(var pid of sel){var ord=(state&&state.orders?state.orders:Array.of()).find(function(x){return Number(x.id)===pid});if(!ord)continue;var ver=Number(ord.version);if(ord.stage===1){await api("orders/action",{id:pid,version:ver,action:"ready"});ver+=1}await api("orders/action",{id:pid,version:ver,action:"assign",courierId:chosen});await api("orders/action",{id:pid,version:ver+1,action:"depart"})}ov.remove();if(typeof toast==="function")toast(sel.size+" paket yola çıkarıldı.");if(typeof sync==="function")await sync(true)}catch(e){alert(e.message||"Hata");b.disabled=false;b.textContent="Teslimata Çıkar"}
    };
  }
  document.addEventListener("click",async function(e){
    var btn=e.target.closest("[data-ad-open],[data-ad-print],[data-ad-kitchen],[data-ad-courier],[data-ad-ready],[data-ad-deliver]"); if(!btn)return;
    e.stopPropagation(); e.preventDefault();
    if(btn.dataset.adOpen&&typeof openOrderDialog==="function")openOrderDialog(Number(btn.dataset.adOpen));
    else if(btn.dataset.adPrint){await api("printers/manage",{action:"queue_order",id:Number(btn.dataset.adPrint),type:"Adisyon"});if(typeof toast==="function")toast("Kasa fişi gönderildi.")}
    else if(btn.dataset.adKitchen){await api("printers/manage",{action:"queue_order",id:Number(btn.dataset.adKitchen),type:"Mutfak"});if(typeof toast==="function")toast("Mutfak fişi gönderildi.")}
    else if(btn.dataset.adCourier)openCourierModal(Number(btn.dataset.adCourier));
    else if(btn.dataset.adReady){var o=state.orders.find(function(x){return Number(x.id)===Number(btn.dataset.adReady)});if(o){await api("orders/action",{id:o.id,version:o.version,action:"ready"});await sync(true)}}
    else if(btn.dataset.adDeliver){var o2=state.orders.find(function(x){return Number(x.id)===Number(btn.dataset.adDeliver)});if(o2){await api("orders/action",{id:o2.id,version:o2.version,action:"deliver",collected:true});await sync(true)}}
  },true);
  setInterval(renderAdisyoCards,450);
})();
