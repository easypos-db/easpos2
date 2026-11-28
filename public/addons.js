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

;(function(){if(window.__scFix)return;window.__scFix=true;var s=document.createElement("style");s.textContent=".board{display:grid!important;grid-template-columns:repeat(4,minmax(240px,1fr))!important;gap:12px!important;align-items:stretch!important}.column{height:calc(100vh - 295px)!important;min-height:380px!important;overflow-y:auto!important;padding-top:0!important}.column-title{position:sticky!important;top:0!important;z-index:10!important;background:#fff!important;padding:10px 8px!important;margin-top:0!important;border-bottom:1px solid #e2e8f0!important}";document.head.appendChild(s)})();


;(function(){
  if(window.__courierNavTelV3)return; window.__courierNavTelV3=true;
  var ordersList=Array.of();
  async function syncOrdersForLinks(){
    try{var r=await fetch("api/state",{headers:{Accept:"application/json"}});if(r.ok){var d=await r.json();if(Array.isArray(d.orders))ordersList=d.orders}}catch(e){}
  }
  function normTel(p){
    var d=String(p||"").split("").filter(function(c){return c>="0"&&c<="9"}).join("");
    while(d.startsWith("0"))d=d.slice(1);
    if(d.startsWith("90")&&d.length===12)return "+"+d;
    if(d.length===10)return "+90"+d;
    return d?"+90"+d:"";
  }
  function buildMapUrl(area){
    return String(area||"").trim()?"#":"";
  }
  function decorateLinks(){
    var appTxt=(document.getElementById("app")&&document.getElementById("app").innerText)||"";
    var isCourier=appTxt.includes("Kurye çalışma ekranı")||appTxt.includes("Hazır paket havuzu");
    document.querySelectorAll(".card.order-card-open[data-order-open], .card[data-order-open]").forEach(function(card){
      if(card.dataset.navTelV3==="1")return;
      var oid=Number(card.getAttribute("data-order-open")),o=ordersList.find(function(x){return Number(x.id)===oid});
      if(!o)return;
      var mapUrl=o.area?buildMapUrl(o.area):"", mapAddress=String(o.area||"").trim();
      var areaEl=card.querySelector(".area");
      if(areaEl&&mapUrl){
        areaEl.innerHTML="<a href='"+mapUrl+"' data-easy-map-link data-easy-map-address='"+mapAddress.replace(/&/g,"&amp;").replace(/'/g,"&#39;")+"' onclick='event.stopPropagation()' style='color:#0369a1;text-decoration:underline;font-weight:600;display:inline-flex;align-items:center;gap:4px'>📍 "+areaEl.textContent.trim()+"</a>";
      }
      if(o.phone){
        var telHref=normTel(o.phone);
        if(telHref&&!card.querySelector(".easy-tel-link")){
          var box=document.createElement("div");
          box.style.cssText="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap";
          box.innerHTML="<a class='easy-tel-link' href='tel:"+telHref+"' onclick='event.stopPropagation()' style='display:inline-flex;align-items:center;gap:4px;background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0;padding:4px 10px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none'>📞 "+o.phone+"</a>";
          var anchor=areaEl||card.querySelector(".payment");
          if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(box,anchor.nextSibling);
          else card.appendChild(box);
        }
      }
      if(isCourier){
        var printBtn=Array.from(card.querySelectorAll("button")).find(function(b){return (b.textContent||"").trim()==="Fişi Yazdır"});
        if(printBtn&&mapUrl){
          var navA=document.createElement("a");
          navA.href=mapUrl;
          navA.setAttribute("data-easy-map-link","");
          navA.setAttribute("data-easy-map-address",mapAddress);
          navA.setAttribute("onclick","event.stopPropagation()");
          navA.textContent="🧭 Konuma Git";
          navA.style.cssText="display:block;width:100%;text-align:center;margin-top:6px;padding:9px 12px;border-radius:10px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;font-weight:700;font-size:13px;text-decoration:none;box-sizing:border-box";
          printBtn.replaceWith(navA);
        }else if(printBtn){
          printBtn.remove();
        }
      }
      card.dataset.navTelV3="1";
    });
  }
  syncOrdersForLinks(); setInterval(syncOrdersForLinks,5000); setInterval(decorateLinks,400);
})();

;(function(){
  if(window.__tySyncBtn)return; window.__tySyncBtn=true;
  let syncing=false;
  async function request(action,change){
    const response=await fetch("api/integrations/trendyol/"+action,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({change})});
    const data=await response.json();
    if(!data.ok)throw Error([data.status?"Trendyol HTTP "+data.status:"EasyPOS HTTP "+response.status,data.error,data.summary].filter(Boolean).join(" · "));
    return data;
  }
  async function sync(button,manual){
    if(syncing)return;
    syncing=true;if(button)button.disabled=true;
    try{
      const d=await request("sync");
      const storeSummary=(d.stores||[]).map(store=>store.name).join(", ");
      const message="Trendyol HTTP "+d.status+" · "+d.fetched+" paket, "+d.imported+" yeni sipariş"+(storeSummary?" · "+storeSummary:"")+" · "+d.summary+(d.warnings?" · "+d.warnings:"");
      if(button)button.title=message;
      if(manual)alert(message);
    }catch(e){if(button)button.title=e.message;if(manual)alert(e.message)}
    finally{syncing=false;if(button)button.disabled=false}
  }
  function panel(){
    const dialog=document.createElement("dialog");
    dialog.className="easy-integration-center";
    dialog.innerHTML='<style>.easy-integration-center{width:min(900px,94vw);max-width:none;max-height:90vh;overflow:auto;border:1px solid rgba(255,255,255,.72);border-radius:22px;padding:26px;background:rgba(255,255,255,.91);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);color:#253348;box-shadow:0 24px 80px #17203338}.easy-integration-center::backdrop{background:rgba(25,35,48,.35);backdrop-filter:blur(5px)}.easy-integration-head{display:flex;justify-content:space-between;align-items:center}.easy-integration-head h2{margin:0}.easy-integration-refresh{display:flex;justify-content:space-between;align-items:center;margin:18px 0;padding:14px 18px;border:1px solid #e3e7ed;border-radius:14px;background:#f8fafc}.easy-integration-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:14px 0}.easy-integration-card{border:1px solid #e2e7ee;border-radius:16px;padding:18px;background:#fff}.easy-integration-card h3{margin:0 0 8px}.easy-integration-counts{display:flex;gap:16px;font-weight:700}.easy-integration-counts .on{color:#27934e}.easy-integration-counts .off{color:#d83a3a}.easy-integration-change{margin:12px 0}.easy-integration-platform{margin-top:18px;border-top:1px solid #e7ebf0;padding-top:14px}.easy-integration-platform-head,.easy-integration-row{display:flex;align-items:center;gap:12px}.easy-integration-platform-head{justify-content:space-between;padding:8px 2px}.easy-integration-row{padding:11px 4px;border-top:1px solid #edf0f4}.easy-integration-row .label{flex:1}.easy-integration-dot{width:10px;height:10px;border-radius:50%;background:#20a454;flex:none}.easy-integration-dot.off{background:#df3434}.easy-integration-dot.unknown{background:#a0a8b4}.easy-integration-choices{display:flex;gap:6px;flex-wrap:wrap}.easy-integration-choices button{padding:6px 9px;font-size:12px}.easy-integration-note{color:#7a8594;font-size:12px}.easy-integration-footer{display:flex;justify-content:flex-end;margin-top:20px}@media(max-width:620px){.easy-integration-center{padding:18px}.easy-integration-cards{grid-template-columns:1fr}.easy-integration-row{align-items:flex-start;flex-wrap:wrap}.easy-integration-row .label{min-width:65%}}</style><div class="easy-integration-head"><div><h2>Entegrasyon Durumları</h2><div class="easy-integration-note">Platform ve marka sipariş alım durumları</div></div><form method="dialog"><button aria-label="Kapat">×</button></form></div><div class="easy-integration-refresh"><div><strong>Entegrasyon Yenilenme Süresi</strong><div id="easyTyCountdown" class="easy-integration-note">30 sn</div></div><button type="button" id="easyTyRefreshNow" aria-label="Şimdi yenile">⟳ Yenile</button></div><div id="easyTySummary" class="easy-integration-cards"></div><button type="button" class="easy-integration-change" id="easyTyChangeToggle">Durumları Değiştir</button><div id="easyTyManage" hidden></div><p id="easyTyStatus" role="status" class="easy-integration-note"></p><div class="easy-integration-footer"><form method="dialog"><button class="primary">Kapat</button></form></div>';
    document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();
    const summary=dialog.querySelector("#easyTySummary"),manage=dialog.querySelector("#easyTyManage"),info=dialog.querySelector("#easyTyStatus"),countdown=dialog.querySelector("#easyTyCountdown"),refreshButton=dialog.querySelector("#easyTyRefreshNow");
    const labels={OPEN:"Açık",CLOSED:"Kapalı",BUSY:"Yoğun",UNCONFIGURED:"Token gerekli"};
    let latest=null,remaining=30,refreshing=false;
    const statusText=value=>labels[value]||value||"Bilinmiyor";
    const stateClass=value=>value==="OPEN"||value==="BUSY"?"on":value==="CLOSED"?"off":"unknown";
    const esc=value=>String(value||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
    function render(data){
      latest=data;const accounts=data.accounts||[],tyRows=accounts.flatMap(account=>account.stores||[]),configuredRows=tyRows.filter(row=>row.configured),active=configuredRows.filter(row=>row.state==="OPEN"||row.state==="BUSY").length,passive=configuredRows.filter(row=>row.state==="CLOSED").length,unknown=configuredRows.length-active-passive;
      summary.innerHTML='<section class="easy-integration-card"><h3>Trendyol Yemek</h3><div class="easy-integration-counts"><span class="on">'+active+' Aktif</span><span class="off">'+passive+' Pasif</span></div>'+(unknown?'<div class="easy-integration-note">'+unknown+' şubenin durumu bilinmiyor.</div>':'')+'</section><section class="easy-integration-card"><h3>Yemeksepeti</h3><div class="easy-integration-counts"><span class="easy-integration-note">Durum bilgisi alınamıyor</span></div><div class="easy-integration-note">Şube durum API bağlantısı yapılandırılmamış.</div></section>';
      const tyRowsMarkup=accounts.map(account=>{
        const rows=account.stores?.length?account.stores:[{id:"",supplierId:account.supplierId,brand:account.brand,name:account.name,state:"UNCONFIGURED",configured:false}];
        return '<div class="easy-integration-platform"><div class="easy-integration-platform-head"><strong>Trendyol Yemek · '+esc(account.name)+' ('+esc(account.supplierId)+')</strong><button type="button" data-ty-bulk="'+esc(account.supplierId)+'" '+(!account.configured?'disabled':'')+'>Tümünü Aç/Kapa</button></div>'+rows.map((row,index)=>'<div class="easy-integration-row"><i class="easy-integration-dot '+stateClass(row.state)+'"></i><span class="label">'+esc(row.name||account.name)+' · '+statusText(row.state)+(row.configured?'':' · Token gerekli')+'</span><button type="button" data-ty-change="'+esc(account.supplierId)+'|'+esc(row.id)+'" '+(!row.configured?'disabled':'')+'>Değiştir</button><div class="easy-integration-choices" data-ty-choices="'+esc(account.supplierId)+'|'+esc(row.id)+'" hidden><button type="button" data-ty-state="OPEN">🟢 Açık</button><button type="button" data-ty-state="BUSY">🟡 Yoğun</button><button type="button" data-ty-state="CLOSED">🔴 Kapalı</button></div></div>').join('')+'</div>';
      }).join('');
      const ysRows=['Easy Wingy','Easy Macaroni'].map(name=>'<div class="easy-integration-row"><i class="easy-integration-dot unknown"></i><span class="label">'+name+' · Durum bağlantısı yok</span><button type="button" disabled>Değiştir</button></div>').join('');
      manage.innerHTML=tyRowsMarkup+'<div class="easy-integration-platform"><div class="easy-integration-platform-head"><strong>Yemeksepeti</strong><button type="button" disabled>Tümünü Aç/Kapa</button></div>'+ysRows+'</div>';
      if(data.errors?.length)info.textContent=data.errors.join(" · ");else info.textContent="Durumlar güncellendi.";
    }
    async function refresh(){
      if(refreshing)return;refreshing=true;refreshButton.disabled=true;
      try{const data=await request("status");render(data);remaining=30;countdown.textContent=remaining+" sn"}
      catch(error){info.textContent=error.message}
      finally{refreshing=false;refreshButton.disabled=false}
    }
    async function changeState(supplierId,storeId,state){
      let change={supplierId,storeId,state};
      if(state==="BUSY"){
        const range=prompt("Normal teslimat aralığı kaç dakika? Örneğin 25-35. Yoğun modda her iki süreye 10 dakika eklenir.");if(!range)return;
        const match=range.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);if(!match){info.textContent="Dakika aralığını 25-35 biçiminde girin.";return}change.min=Number(match[1]);change.max=Number(match[2]);
      }
      info.textContent="Trendyol durumu güncelleniyor…";
      try{await request("status",change);await refresh()}
      catch(error){info.textContent=error.message}
    }
    refreshButton.onclick=refresh;
    dialog.querySelector("#easyTyChangeToggle").onclick=()=>{manage.hidden=!manage.hidden};
    manage.onclick=event=>{
      const target=event.target.closest("[data-ty-change],[data-ty-state],[data-ty-bulk],[data-ys-change],[data-ys-bulk]");if(!target)return;
      if(target.hasAttribute("data-ys-change")||target.hasAttribute("data-ys-bulk")){info.textContent="Yemeksepeti şube durum API bağlantısı yapılandırılmamış; bu işlem platformda değişiklik yapmadı.";return}
      if(target.hasAttribute("data-ty-change")){const key=target.dataset.tyChange;manage.querySelector('[data-ty-choices="'+CSS.escape(key)+'"]').hidden=false;return}
      if(target.hasAttribute("data-ty-state")){const [supplierId,storeId]=target.closest(".easy-integration-row").querySelector("[data-ty-change]").dataset.tyChange.split("|");changeState(supplierId,storeId,target.dataset.tyState);return}
      if(target.hasAttribute("data-ty-bulk")){
        const supplierId=target.dataset.tyBulk,rows=(latest?.accounts||[]).find(account=>account.supplierId===supplierId)?.stores||[],eligible=rows.filter(row=>row.configured&&row.id),desired=eligible.some(row=>row.state!=="OPEN")?"OPEN":"CLOSED";
        if(!eligible.length){info.textContent="Bu satıcı hesabında yapılandırılmış aktif şube yok.";return}
        (async()=>{for(const row of eligible){try{await request("status",{supplierId,storeId:row.id,state:desired})}catch(error){info.textContent=error.message;break}}await refresh()})();
      }
    };
    refresh();const timer=setInterval(()=>{if(!dialog.isConnected){clearInterval(timer);return}remaining--;countdown.textContent=Math.max(0,remaining)+" sn";if(remaining<=0)refresh()},1000);
  }

  setInterval(function(){
    const anchor=Array.from(document.querySelectorAll("button")).find(b=>b.textContent.includes("Yeni paket siparişi"));
    if(!anchor||document.getElementById("easyTySyncBtn"))return;
    const btn=document.createElement("button");btn.id="easyTySyncBtn";btn.textContent="🟠 Trendyol Çek";btn.onclick=()=>sync(btn,true);
    const status=document.createElement("button");status.textContent="Entegrasyon Durumları";status.onclick=panel;
    anchor.before(status,btn);
  },600);
  setInterval(()=>{
    const button=document.getElementById("easyTySyncBtn");
    if(typeof me!=="undefined"&&me&&me.role==="admin"&&document.visibilityState==="visible")sync(button,false);
  },30000);
})();
