# Easy Operasyon

Easy Wingy ve Easy Macaroni için sipariş ve kurye yönetim uygulaması.

- UI: Sunulan HTML ve `public/ui.js`.
- API: Vinext route handler, `lib/api.ts`.
- Kalıcı veri: Sites projesine bağlı Cloudflare D1 (`DB`). Siparişler farklı cihazlarda ortak görünür.
- Sipariş türleri: Paket, Gel Al ve 1–9 masa. Açık masaya eklenen ürünler aynı hesaba eklenir.
- Menü: 75 ürün ve kuruş cinsinden fiyatlar. Fiyat değişiklikleri uygulamada açılan yeni siparişlerde geçerlidir; Yemeksepeti/Trendyol menülerini değiştirmez.
- Erişim: Yönetici alanı ve kullanıcı adı/PIN ile kurye oturumu. Kurye PIN'leri yönetici tarafından tanımlanır.
- Platform bağlantıları: Yemeksepeti ve Trendyol için güvenli webhook uçları ve anahtar yönetimi bulunur. Sağlayıcı hesabındaki webhook ayarları ayrıca yapılmalıdır.
- Örnek sipariş oluşturma kapalıdır. Eski demo kayıtları silinmemiştir, sipariş panosu ve raporlara dahil edilmez.

## Ücretsiz katman

D1 mevcut Sites uygulamasına zaten bağlı; ikinci bir veri hizmeti hesabı veya Supabase/Firebase anahtarı gerekmiyor. D1 ücretsiz katmanının günlük sorgu ve depolama sınırları bulunur; sınırlar aşılırsa sorgular başarısız olabilir. Gerçek kullanım büyüdükçe kullanım izlenmelidir.


## Local setup and deployment notes

- Install dependencies with `pnpm install`, then run `pnpm dev` or build with `pnpm build`.
- Existing D1 migrations are in `drizzle/0000` through `drizzle/0008`. Additional runtime-created tables are documented in `sql/runtime-schema.sql`; the application creates them automatically.
- `wrangler.toml` is a standalone deployment template. Replace its sample D1 `database_id` with the ID from your own Cloudflare account before `wrangler deploy`. The production Sites deployment retains its existing D1 binding separately.
- The local bridge is `public/print-bridge.js`. It requires Node.js and CUPS (`lp`/`lpstat`) on macOS or Linux. Generate a bridge token from Yazıcılar, download the script, and run it on the computer connected to the printers.
- Configure webhook tokens in Yazıcılar. Provider-side webhook URLs and payload mapping must also be enabled in each provider account.
- Offline order entry/payment uses the browser's IndexedDB queue. Sign in and open the menu/order views online once so the app shell, menu, and current state are cached on that device.
- No live customer/order data, account credentials, webhook tokens, or bridge keys are included in this source archive.
