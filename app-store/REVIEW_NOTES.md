# App Review notları — gönderim öncesi doğrulanacak taslak

Yeni build gerçek cihazda test edildikten sonra İngilizce notları App Store Connect'e aktarın. Hesap gerektiren eşitlemeyi incelemek için ayrı bir test hesabı ve gerekli veri parolası sağlayın; parolaları bu depoya yazmayın. Aşağıdaki notlar şu anda App Store Connect'e gönderilmedi.

## Notes for Review

Kuruşu Kuruşuna is a personal income, expense and budget tracker. Core local tracking works without an account. Account sign-in is used for optional encrypted synchronization.

- On a fresh installation, tap “Örnek verilerle dene” to add sample records to the regular app. These records can be removed in Settings; this does not enable a separate feature set.
- The bottom tabs provide Overview, Transactions, Accounts and Recurring Payments.
- Tap “Diğer” (More) for Savings, Currency and Gold tracking, Debts and Receivables, Budget and Reports, and Settings. These sections record personal finances; they do not execute bank transfers or buy/sell financial assets.
- In Settings, “Hesap ve eşitleme” provides email, Google and Sign in with Apple options. After sign-in, synchronization uses a separate data passphrase.
- Account deletion is available under Settings → Account → “Hesabımı sil”, including when the data passphrase has not been entered. Deletion removes the cloud account; local device records remain, as explained in the confirmation.
- Settings → Security and privacy → “Politikayı aç” opens the privacy policy. Optional PIN/password/biometric locking and amount hiding are user-controlled privacy settings.
- Statement import is available in Transactions. Monthly PDF export is in Budget and Reports.
- Currency/metal prices and synchronization require network access. Local financial tracking works offline. iOS updates are distributed through the App Store.

## Clarification request for the existing rejection

Hello App Review Team,

Regarding version 1.9.0, build 202610192213, we take your concern under Guideline 5.6 seriously. Could you please identify the features that appeared to be intentionally hidden, along with the steps to reproduce the behavior and the device model and OS version used? A screenshot would also help us investigate.

Additional budgeting sections are accessible through the “Diğer” (More) tab, and optional synchronization is accessible through “Ayarlar” (Settings). We would appreciate further details so we can investigate the exact behavior in the submitted build.

Thank you.
