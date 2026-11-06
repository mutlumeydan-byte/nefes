# Nefes (Expo) — yayın

Web: https://nefes-mutlumeydan-bytes-projects.vercel.app
Gizlilik: https://nefes-mutlumeydan-bytes-projects.vercel.app/privacy.html
Mağaza metinleri ve ekran görüntüleri: `store/`

## Önce (bir kere)
```
npm install -g eas-cli
eas login
cd nefes-expo
npm install
eas init            # projeyi Expo hesabına bağlar, app.json'a projectId yazar
```

## iOS → TestFlight
```
eas build --platform ios --profile production
```
Apple ID + uygulamaya özel parola sorar; sertifika/profil için "Let Expo handle" de. 10–20 dk.
```
eas submit --platform ios --latest
```
15–30 dk sonra App Store Connect → TestFlight'ta build görünür; telefondaki TestFlight uygulamasından kur.
Mağaza için: App Store Connect → Nefes → sürüm bilgileri (LISTING.md) → ekran görüntüleri (`store/screenshots/ios67-*`) → fiyat Tier 1 → Submit for Review.

## Android → Google Play
```
eas build --platform android --profile production
eas submit --platform android --latest
```
İlk Android gönderimi için Play Console'da uygulamayı bir kere elle oluşturup ilk AAB'yi elle yüklemek gerekir (Google kuralı); sonrası `eas submit` ile.
Ekran görüntüleri: `store/screenshots/android-*`.

## Güncelleme
`App.js` değiştir → `eas build` (production profili build numarasını otomatik artırır) → `eas submit`.
Sadece JS değiştiyse mağazasız anlık güncelleme için: `eas update --branch production` (isteğe bağlı, EAS Update).
