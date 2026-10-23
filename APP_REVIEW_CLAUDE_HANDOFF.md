# Kuruşu Kuruşuna — Claude için çalışma devri

Tarih: 23 Ekim 2026. Bu belge yapılan incelemeyi, uygulanan değişiklikleri ve henüz tamamlanmayan dağıtım adımlarını ayırır.

## Ret ve kanıtlar

- Apple, iOS 1.9.0 / build `202610192213` için Guideline 5.6 reddi verdi. Mesaj, inceleme sırasında kasıtlı gizlenmiş gibi görünen özelliklerden söz ediyor; özellik adı, tekrar üretme adımı veya cihaz bilgisi vermiyor.
- Kullanıcının paylaştığı checkout logu `5d601afd917aa80f039a9316b7137fe43ca79136` commit'ini gösteriyor. GitHub API bunu Sürüm yayınla #15 çalışmasıyla eşleştirdi. Çalışmanın bütünü cancelled; paylaşılan iOS iş ekranı ise başarılı yükleme gösteriyor. Build zamanı da bu çalışmayla uyumlu. Gönderilen IPA ayrıca alınarak doğrulanmadı.
- Bu commit'in 159 dosyası kullanıcının indirdiği main ZIP'iyle Git blob SHA-1 karşılaştırmasında birebir eşleşti. Farklar `.github/workflows/release.yml`, `docs/test/KurusuKurusuna.ipa`, `docs/test/index.html`, `docs/test/manifest.plist` idi.
- Başlangıçta Gelir-Gider kökünde ios/android yoktu. İndirilen tam projede mevcuttu. renderer/mobile/scripts/.github karşılaştırılan dosyaları aynıydı.
- Daha sonra GitHub'ın tam Git kopyası `Gelir-Gider/kurusu-kurusuna` altına klonlandı. Başlangıç HEAD: `0786b90`. Git işlemleri için bu alt klasör esas alınmalıdır. Üst klasör kullanıcıya ait ek belgeler ve imza klasörleri de içerir; bunlar GitHub'a eklenmemelidir.
- Kaynak incelemesinde incelemeciyi tanıma, ülkeye/IP'ye göre gizli özellik açma veya uzaktan yeni iOS işlevi yükleme mekanizması bulunmadı. Bu sonuç tam güvenlik denetimi veya gerçek cihaz testi değildir. `window.__KK_TEST_CLOUD` test enjeksiyon noktası mevcut; kendiliğinden etkinleştiğine dair kanıt yok.
- Capacitor yerel renderer içeriğini yükler; server.url yok. Android güncelleyicisi iOS'ta çalıştırılmıyor. Örnek veri normal uygulamaya kayıt ekler. Diğer menüsündeki sayfalar normal navigasyondur; tek başına gizleme kanıtı değildir.

## Uygulanan düzeltmeler

1. `renderer/app.js`: Ayarlar → Güvenlik ve gizlilik → Politikayı aç düğmesi ve open-privacy eylemi.
2. `mobile/bridge.js`, `main.js`: Yalnızca tam gizlilik URL'sine ek izin. GitHub Pages'in tamamı veya keyfi URL'ler açılmadı.
3. `renderer/sync.js`: Oturum açıkken şifreleme anahtarı bulunmasa da Hesap menüsü ve hesap silme erişilebilir. Null durumunda menü başlığı hata vermez. Anahtar olmadan veri parolası değiştirme seçeneği gösterilmez.
4. `docs/gizlilik.html`: Geri bildirim alanları, Supabase kullanımı, hesapla ilişkilendirme, saklama/silme, Apple ile giriş ve iOS güncelleme farkı açıklandı. Canlı SQL henüz uygulanmadığı için geri bildirimlerin otomatik silindiği garantisi verilmedi; iletişim yoluyla silme talebi açıklandı.
5. `supabase/kurulum.sql`: delete_my_account, auth kullanıcısını silmeden önce o kullanıcı kimliğine bağlı feedback kayıtlarını siler. Finansal vault/records mevcut cascade ilişkileriyle silinir. İşlem fonksiyon çağrısının transaction'ında gerçekleşir.
6. `supabase/migrations/20261023_delete_account_feedback.sql`: Mevcut sunucu için aynı fonksiyon güncellemesi. Dosyanın uygulanması o anda hesap silmez; ileride kullanıcının yaptığı hesap silmelerini düzeltir. Anonim, user_id'siz veya önceden silinmiş hesaplardan kalan feedback kayıtlarını temizlemez. Bunlar ayrıca değerlendirilmelidir.
7. `.github/workflows/{release,apple-check,ios-adhoc,mobile-check}.yml`: cap sync öncesinde kaynak paketleri yeniden derlenir ve iOS sürümü eşitlenir (`npm run mobile:sync -- ios/android`). Tarihli build üreten akışlarda build ve GITHUB_SHA loga yazılır. Bu değişiklik eski bundle gönderme riskini azaltır; ret sebebi olduğuna dair kanıt yoktur.
8. `renderer/vendor` paketleri kaynaklardan yeniden üretildi.
9. `app-store/REVIEW_NOTES.md`: İnceleme adımları ve Apple'dan somut bilgi isteme taslağı.
10. `scripts/review-fixes.test.cjs`: Anahtarsız hesap silme erişimi, normal hesap menüsü, çıkış durumu ve mobil URL izinleri için dört davranış testi.

## Doğrulama

- `node --test scripts/review-fixes.test.cjs`: 4 test geçti.
- `node --check` ile değişen uygulama JavaScript dosyaları kontrol edildi.
- `npm run mobile:sync -- ios`: tüm JS paketleri derlendi ve iOS sync başarılı oldu.
- Bu işlem Windows'ta yapıldı; Xcode archive veya gerçek iPhone/iPad testi yapılmadı.
- SQL canlı Supabase üzerinde çalıştırılmadı. E-posta/Google/Apple girişleri veya silme uçtan uca test edilmedi.
- Sürüm 1.9.0 bırakıldı. Yeni TestFlight/App Store yüklemesi veya sürüm etiketi otomatik başlatılmadı.

## Yayından önce kalanlar

1. Mevcut Supabase'de feedback tablosunun bulunduğunu doğrula ve migration SQL'ini uygula. Ayrı bir deneme hesabında ilişkili feedback/vault/records oluştur, hesabı sil ve başka bir hesabın kayıtlarına dokunulmadığını doğrula.
2. Hesapsız feedback için silme taleplerini işleyecek destek sürecini yürüt. Önceden hesabı silinmiş kullanıcılardan kalan kayıtları ve veri saklama süresini değerlendir. Apple ile giriş token iptali gerekliliklerini ayrıca doğrula; bu çalışma yalnızca Supabase hesabının silinmesini düzenledi.
3. GitHub Pages'de yeni gizlilik metninin yayımlandığını ve uygulamadaki düğmenin gerçek cihazda açıldığını kontrol et. App Store Connect Privacy Policy URL ve App Privacy beyanlarıyla karşılaştır; Connect alanları bu çalışmada değiştirilmedi.
4. iPhone ve iPad uyumluluk modunda örnek verili/verisiz, çevrimiçi/çevrimdışı, yatay/dikey kullanım; giriş, veri parolası unutma, silme ve geri bildirim akışlarını test et. TARGETED_DEVICE_FAMILY=1 kaldırılmadı; iPad'i hedeflerden çıkarmak uyumluluk modunu engellemez.
5. İnceleme için gerçek finansal veri içermeyen hesap ve gerekli veri parolasıyla test erişimi sağla. İncelemeciye özel özellik değiştirme mantığı ekleme. Notlarda menü yollarını açıkla.
6. Apple'a hangi özellik, cihaz ve tekrar üretme adımlarını kastettiklerini sor. 5.6 reddinin kesin nedeni hâlâ bilinmiyor; bu düzeltmeleri sebebin kanıtı veya onay garantisi gibi sunma.

## Kaynaklar

- https://developer.apple.com/app-store/review/guidelines/
- https://developer.apple.com/help/app-review/before-submitting-for-review/test-compatible-devices
- https://github.com/emirhanduran27-lab/kurusu-kurusuna/actions/runs/39333135693

Gizlilik, hesap silme ve incelemeye erişim eksikleri; 5.1.1(i), 5.1.1(v), 2.1 ve 2.3.1 kapsamında ele alındı. Tam App Review uygunluğu yalnızca kaynak koddan doğrulanamaz.
