# BAF 2026 — Remote Push Broadcast

## Apa yang dibuat

- `bafRemotePush`: memerhati `battlezapin/main`.
- Apabila status Tarian / Tingkah Geruh berubah, Cloud Function menghantar Web Push kepada semua peranti yang sudah subscribe.
- `bafRemotePushManual`: digunakan untuk event manual seperti “Akan Bermula”.
- Peranti asal admin dikecualikan menggunakan `deviceId`, supaya admin tidak menerima dua notification untuk event yang sama.
- Subscription lama yang mengembalikan HTTP 404/410 akan dibuang automatik.

## Perlu sebelum deploy

1. Firebase project mesti menggunakan Cloud Functions.
2. Production deployment Cloud Functions memerlukan Blaze/pay-as-you-go plan.
3. Jana VAPID keys secara lokal:
   `npx web-push generate-vapid-keys`
4. Simpan private key sebagai Secret Manager, jangan letak dalam `index.html`.
5. Public key perlu dimasukkan ke `window.BAF_VAPID_PUBLIC_KEY` dalam webapp supaya iPhone boleh membuat PushSubscription.
6. Deploy dengan Firebase CLI.

Contoh secret:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT` = `mailto:admin@domain-anda`

## Nota keselamatan

Client webapp anda sekarang menggunakan login admin tersendiri. Remote push function ini tidak menjadikan login itu sebagai Firebase Authentication. Untuk production, Firestore Security Rules perlu menyekat siapa yang boleh menulis `battlezapin/pushEvents`, dan akses kepada data subscription perlu dikawal.

## Deploy

Di folder projek Firebase:

```bash
npm install -g firebase-tools
firebase login
firebase use baf2026-812aa
cd functions
npm install
cd ..
firebase deploy --only functions
```

Node.js 22 ialah runtime yang disokong Cloud Functions pada masa dokumentasi ini disemak.

