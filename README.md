# Kuruşu Kuruşuna

Gelir, gider, düzenli ödeme, bütçe ve birikim takibi için Windows ve Mac masaüstü uygulaması. Eski adı "Gelir Gider".

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

## Güncellemeler

Program açılışta ve açık kaldığı sürece 6 saatte bir yeni sürüme bakar. Yeni sürüm varsa arka planda iner, sol altta "Güncelleme geldi" kutusu çıkar. İnince kutu yeşile döner. Program kapanınca güncelleme sessizce kurulur, istenirse kutuya tıklayıp hemen kurulabilir. Kurulum sihirbazı açılmaz, veriler korunur. Windows ve Mac'te aynı şekilde çalışır.

## Bölümler

- **Özet**: Ay seçimi, gelir, gider, birikime aktarılan ve ay sonu kalan; yaklaşan ödemeler, bütçe durumu, son 6 ay grafiği, kategori dağılımı.
- **İşlemler**: Gelir ve gider kayıtları. Arama, ay, tür, kategori ve ödeme yöntemine göre filtre. CSV (Excel) dışa aktarma.
- **Düzenli Ödemeler**: Kira, fatura, abonelik, taksit, maaş gibi tekrarlayan kalemler. "Ödendi" deyince işlem olarak eklenir ve tarih ileri alınır. Açılışta yaklaşan ödemeler için Windows bildirimi gelir.
- **Birikimler**: Hedef tutar ve tarih, para ekleme ve çekme, ilerleme ve aylık gereken tutar.
- **Bütçe ve Raporlar**: Kategori başına aylık limit, geçen ay ve 6 aylık ortalama ile karşılaştırma, yıllık grafikler.
- **Ayarlar**: Tema, para birimi, kategoriler, yedekleme ve güncellemeler.

Kısayollar: `G` yeni gelir, `N` yeni gider.

## Veriler

Tüm veriler bilgisayarda kalır. Windows'ta `%APPDATA%\Kuruşu Kuruşuna\veri.json`, Mac'te `~/Library/Application Support/Kuruşu Kuruşuna/veri.json`. Her gün otomatik bir kopya `yedekler` klasörüne alınır (son 30 gün). "Gelir Gider" sürümünden geçenlerin verileri ilk açılışta kendiliğinden taşınır.

## Geliştirme

```
npm install
npm start
```

## Yeni sürüm yayınlama

1. `package.json` içindeki `version` değerini artır (örneğin `1.2.0`) ve değişiklikleri `main` dalına gönder.
2. GitHub'da **Actions → Sürüm yayınla → Run workflow** düğmesine bas. Ya da aynı numarayla `v1.2.0` etiketi gönder.
3. İş akışı önce Windows, sonra Mac kurulum dosyasını derleyip `v1.2.0` sürümü olarak Releases'e yükler. Kullanıcılardaki program birkaç saat içinde güncellemeyi bulur.

Sürüm numarası artırılmadan çalıştırılırsa yeni bir sürüm çıkmaz, var olan sürümün dosyaları yenilenir.

## Kod imzalama

Kurulum dosyası şu an imzasız. Emirhan Duran adına kod imzalama sertifikası ya da imzalama hizmeti alındığında iş akışına imzalama adımı eklenecek. İş akışı `.pfx` dosyası için `WIN_CSC_LINK` ve `WIN_CSC_KEY_PASSWORD` secret'larını şimdiden tanıyor.
