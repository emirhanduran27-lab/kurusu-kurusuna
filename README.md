# Kuruşu Kuruşuna

Gelir, gider, düzenli ödeme, bütçe ve birikim takibi için Windows masaüstü uygulaması. Eski adı "Gelir Gider".

## Kurulum

[Releases](https://github.com/emirhanduran27-lab/kurusu-kurusuna/releases/latest) sayfasından `KurusuKurusuna-Kurulum-x.y.z.exe` dosyasını indirip çalıştır. Program sonraki sürümleri kendisi bulur ve kurar.

## Bölümler

- **Özet**: Ay seçimi, gelir, gider, birikime aktarılan ve ay sonu kalan; yaklaşan ödemeler, bütçe durumu, son 6 ay grafiği, kategori dağılımı.
- **İşlemler**: Gelir ve gider kayıtları. Arama, ay, tür, kategori ve ödeme yöntemine göre filtre. CSV (Excel) dışa aktarma.
- **Düzenli Ödemeler**: Kira, fatura, abonelik, taksit, maaş gibi tekrarlayan kalemler. "Ödendi" deyince işlem olarak eklenir ve tarih ileri alınır. Açılışta yaklaşan ödemeler için Windows bildirimi gelir.
- **Birikimler**: Hedef tutar ve tarih, para ekleme ve çekme, ilerleme ve aylık gereken tutar.
- **Bütçe ve Raporlar**: Kategori başına aylık limit, geçen ay ve 6 aylık ortalama ile karşılaştırma, yıllık grafikler.
- **Ayarlar**: Tema, para birimi, kategoriler, yedekleme ve güncellemeler.

Kısayollar: `G` yeni gelir, `N` yeni gider.

## Veriler

Tüm veriler bilgisayarda kalır: `%APPDATA%\Kuruşu Kuruşuna\veri.json`. Her gün otomatik bir kopya `yedekler` klasörüne alınır (son 30 gün). "Gelir Gider" sürümünden geçenlerin verileri ilk açılışta kendiliğinden taşınır.

## Geliştirme

```
npm install
npm start
```

## Yeni sürüm yayınlama

1. `package.json` içindeki `version` değerini artır (örneğin `1.2.0`).
2. Değişiklikleri gönder, sonra aynı numarayla etiket gönder:
   ```
   git commit -am "Sürüm 1.2.0"
   git tag v1.2.0
   git push && git push --tags
   ```
3. GitHub Actions kurulum dosyasını derleyip Releases'e yükler. Kullanıcılardaki program birkaç saat içinde güncellemeyi bulur.

Etiketteki numara ile `package.json` içindeki sürüm aynı olmalı.

## Kod imzalama

Kurulum dosyası şu an imzasız. Emirhan Duran adına kod imzalama sertifikası ya da imzalama hizmeti alındığında iş akışına imzalama adımı eklenecek. İş akışı `.pfx` dosyası için `WIN_CSC_LINK` ve `WIN_CSC_KEY_PASSWORD` secret'larını şimdiden tanıyor.
