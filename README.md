# Kuruşu Kuruşuna

Gelir, gider, düzenli ödeme, bütçe ve birikim takibi için Windows, Mac, Android ve iPhone uygulaması. Eski adı "Gelir Gider".

## Kurulum

[Releases](https://github.com/emirhanduran27-lab/kurusu-kurusuna/releases/latest) sayfasından indir.

**Windows:** `KurusuKurusuna-Kurulum-x.y.z.exe` dosyasını çalıştır. "Bilinmeyen yayıncı" uyarısı çıkarsa "Ek bilgi" ve "Yine de çalıştır" de.

**Mac:** `KurusuKurusuna-x.y.z-mac.dmg` dosyasını aç, simgeyi Uygulamalar klasörüne sürükle. Hem Intel hem Apple Silicon (M1, M2, M3, M4) Mac'lerde çalışır. Program Apple tarafından imzalı olmadığı için ilk açılışta macOS engeller:
1. Programı bir kez açmayı dene, uyarıyı kapat.
2. Sistem Ayarları → Gizlilik ve Güvenlik bölümünün altında "Yine de Aç" düğmesine bas.

"Hasarlı, çöp kutusuna taşıyın" uyarısı çıkarsa Terminal'de şunu çalıştırıp tekrar aç:
```
xattr -cr "/Applications/Kuruşu Kuruşuna.app"
```
Program Uygulamalar klasöründen çalışmalı. Doğrudan `.dmg` içinden açılırsa kendini güncelleyemez.

**Android:** `KurusuKurusuna-x.y.z-android.apk` dosyasını telefondan indirip aç. Telefon "bilinmeyen kaynaklardan yükleme" izni isterse tarayıcıya bu izni ver. Yeni sürüm çıkınca uygulama haber verir, dokununca yeni APK iner.

**iPhone:** Apple geliştirici hesabı aktif olunca TestFlight ya da App Store üzerinden dağıtılacak.

## Hesap ve eşitleme

Hesap açmak için e-posta ve parola, Google ile giriş ya da iPhone'da Apple ile giriş kullanılabilir.

Ayarlar → Hesap ve eşitleme bölümünden e-posta ya da Google ile hesap açılır. Aynı hesapla giriş yapılan bilgisayar ve telefonlarda veriler aynı olur. Hesap isteğe bağlıdır; açmayan kişi her şeyi sadece kendi cihazında tutmaya devam eder.

- **Uçtan uca şifreleme:** Veriler cihazdan çıkmadan önce AES-256 ile şifrelenir. Anahtar, kullanıcının belirlediği **veri parolası** ile kilitlenir. Sunucuda (Supabase) sadece okunamayan metin durur, uygulamanın sahibi de dahil kimse verileri göremez.
- **Kurtarma anahtarı:** Veri parolası belirlenirken bir kez gösterilir. Veri parolası unutulursa veriler sadece bununla açılabilir.
- **İnternetsiz çalışma:** Kayıtlar önce cihaza yazılır, bağlantı gelince eşitlenir. İki cihazda aynı kayıt değiştirildiyse en son düzenleme kazanır.
- **Cihaza özel ayarlar:** Tema, uygulama kilidi ve tutar gizleme eşitlenmez.
- Sunucu tarafı kurulumu `supabase/kurulum.sql` dosyasındadır.

Hesap açmadan veri taşımak için yedek dosyası da kullanılabilir: Ayarlar → Yedek al, diğer cihazda Yedekten geri yükle.

## Güvenlik ve gizlilik

- **Uygulama kilidi (isteğe bağlı):** Ayarlar → Güvenlik ve gizlilik bölümünden PIN ya da parola seçilir. PIN ya da parola düz metin olarak saklanmaz. Mac'te Touch ID, telefonda Face ID ya da parmak izi ile de açılabilir. Telefonda uygulama bir dakikadan uzun arka planda kalırsa yeniden kilitlenir. Beş yanlış denemeden sonra bekleme süresi başlar.
- **Unutulursa:** Güvenlik gereği sıfırlanamaz. Kilidi kaldırmanın tek yolu o cihazdaki verileri silmek. Sonra yedek dosyasından geri yüklenebilir.
- **Tutarları gizle:** Göz simgesi ya da `H` tuşu tüm rakamları bulanıklaştırır.

## Güncellemeler

Program açılışta ve açık kaldığı sürece 6 saatte bir yeni sürüme bakar. Yeni sürüm varsa arka planda iner, sol altta "Güncelleme geldi" kutusu çıkar. İnince kutu yeşile döner. Program kapanınca güncelleme sessizce kurulur, istenirse kutuya tıklayıp hemen kurulabilir. Kurulum sihirbazı açılmaz, veriler korunur. Windows ve Mac'te aynı şekilde çalışır.

## Bölümler

- **Özet**: Ay seçimi, gelir, gider, birikime aktarılan ve ay sonu kalan; yaklaşan ödemeler, bütçe durumu, son 6 ay grafiği, kategori dağılımı.
- **Hesaplar**: Nakit, banka, kredi kartı, birikim hesabı. Her hesabın ayrı bakiyesi, hesaplar arası transfer. Eski "ödeme yöntemi" kayıtları ilk açılışta hesaplara taşınır.
- **Kredi kartı**: Limit, kullanılabilir limit, hesap kesim ve son ödeme günü, ekstre borcu, asgari ödeme, gelecek taksitler. "Kartı öde" ile bankadan karta ödeme. Kartla yapılan giderlerde taksit seçilebilir.
- **Döviz ve Altın**: Dolar, euro, sterlin, frank, gram/22 ayar/çeyrek/yarım/tam/Cumhuriyet altını ve gümüş. Alış ve satışlar, ortalama maliyet, güncel kurla değer ve kâr/zarar. Kurlar ECB (günlük) ve gold-api.com'dan alınır, istenirse elle düzeltilir.
- **Hızlı şablonlar**: Sık girilen harcamalar Özet ve İşlemler sayfasının üstünde tek dokunuşla eklenir, "Geri al" ile geri alınır.
- **Bütçe uyarısı**: Bir kategoride aylık limitin %80'ine ve %100'üne ulaşınca bildirim.
- **Banka ekstresi içe aktarma**: Bankadan indirilen Excel (xlsx, xls) ya da CSV hesap hareketleri işlemlere eklenir. Sütunlar otomatik tanınır, kategoriler tahmin edilir, daha önce eklenmiş satırlar ve kart ödemesi gibi transferler işaretlenir. Aynı bankanın dosyası bir dahaki sefere aynı ayarlarla açılır.
- **İçgörüler ve aylık PDF rapor**: Özet sayfasında ay sonu tahmini, bütçe aşımları, ortalamadan sapan kategoriler ve birikim hedeflerinin ne zaman tamamlanacağı gibi notlar. Bütçe ve Raporlar sayfasından istenen ay için PDF rapor alınır.
- **Borç ve Alacak**: Kime ne borçlusun, kim sana borçlu. Kısmi ödemeler, vade hatırlatması. Gider eklerken "Başkalarıyla bölüş" ile arkadaşların payı alacak olarak kaydedilir.
- **İşlemler**: Gelir ve gider kayıtları. Arama, ay, tür, kategori ve ödeme yöntemine göre filtre. CSV (Excel) dışa aktarma.
- **Düzenli Ödemeler**: Kira, fatura, abonelik, taksit, maaş gibi tekrarlayan kalemler. "Ödendi" deyince işlem olarak eklenir ve tarih ileri alınır. Açılışta yaklaşan ödemeler için Windows bildirimi gelir.
- **Birikimler**: Hedef tutar ve tarih, para ekleme ve çekme, ilerleme ve aylık gereken tutar.
- **Bütçe ve Raporlar**: Kategori başına aylık limit, geçen ay ve 6 aylık ortalama ile karşılaştırma, yıllık grafikler.
- **Ayarlar**: Tema, para birimi, kategoriler, yedekleme ve güncellemeler.

Kısayollar: `G` yeni gelir, `N` yeni gider, `H` tutarları gizle.

## Veriler

Tüm veriler bilgisayarda kalır. Windows'ta `%APPDATA%\Kuruşu Kuruşuna\veri.json`, Mac'te `~/Library/Application Support/Kuruşu Kuruşuna/veri.json`. Her gün otomatik bir kopya `yedekler` klasörüne alınır (son 30 gün). "Gelir Gider" sürümünden geçenlerin verileri ilk açılışta kendiliğinden taşınır.

## Geliştirme

```
npm install
npm start              # masaüstü
npm run mobile:sync    # telefon projelerini güncelle (android/ ve ios/)
```

Telefon arayüzü masaüstüyle aynı `renderer/` klasörünü kullanır. `mobile/bridge.js` telefonda dosya kaydı, paylaşma, bildirim ve biyometrik için köprü görevi görür, `npm run bridge` ile paketlenir.

## Yeni sürüm yayınlama

1. `package.json` içindeki `version` değerini artır (örneğin `1.2.0`) ve değişiklikleri `main` dalına gönder.
2. GitHub'da **Actions → Sürüm yayınla → Run workflow** düğmesine bas. Ya da aynı numarayla `v1.2.0` etiketi gönder.
3. İş akışı önce Windows, sonra Mac kurulum dosyasını derleyip `v1.2.0` sürümü olarak Releases'e yükler. Kullanıcılardaki program birkaç saat içinde güncellemeyi bulur.

Sürüm numarası artırılmadan çalıştırılırsa yeni bir sürüm çıkmaz, var olan sürümün dosyaları yenilenir.

## Kod imzalama

**Mac:** Sürümler Emirhan Duran adına Developer ID sertifikasıyla imzalanır ve Apple tarafından onaylanır (notarization). Bu yüzden Mac'te uyarı çıkmadan açılır. İş akışı `APPLE_CSC_P12_BASE64`, `APPLE_CSC_PASSWORD`, `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID` ve `APPLE_API_ISSUER` secret'larını kullanır. Bunlar yoksa imzasız derler. Mac güncelleyicisi, imzalı bir sürümden sonra yalnızca aynı geliştirici imzasını taşıyan sürümleri kurar.

**iPhone:** Her sürümde iOS uygulaması derlenip App Store Connect'e yüklenir ve TestFlight'ta görünür. Bunun için ayrıca `APPLE_TEAM_ID` secret'ı gerekir.

**Windows:** Kurulum dosyası şu an imzasız. İş akışı `.pfx` dosyası için `WIN_CSC_LINK` ve `WIN_CSC_KEY_PASSWORD` secret'larını şimdiden tanıyor.
