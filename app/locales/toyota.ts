import type { TranslationCatalog } from '../i18n';
const rows = [
  ['Built around your experience', 'ನಿಮ್ಮ ಅನುಭವವನ್ನು ಕೇಂದ್ರವಾಗಿರಿಸಿ', 'आपके अनुभव को केंद्र में रखकर', 'あなたの体験を中心に'],
  ['Your voice.', 'ನಿಮ್ಮ ಧ್ವನಿ.', 'आपकी आवाज़।', 'あなたの声。'],
  ['Our next gear.', 'ನಮ್ಮ ಮುಂದಿನ ಹೆಜ್ಜೆ.', 'हमारा अगला कदम।', '次の一歩へ。'],
  ['Every drive has a story. Share yours and help shape what comes next.', 'ಪ್ರತಿ ಪ್ರಯಾಣಕ್ಕೂ ಒಂದು ಕಥೆಯಿದೆ. ನಿಮ್ಮ ಕಥೆಯನ್ನು ಹಂಚಿಕೊಳ್ಳಿ ಮತ್ತು ಮುಂದಿನ ಬದಲಾವಣೆಗೆ ನೆರವಾಗಿ.', 'हर सफ़र की एक कहानी है। अपनी कहानी साझा करें और आगे की राह बेहतर बनाएँ।', 'すべてのドライブに物語があります。あなたの体験で、これからをもっと良く。'],
  ['Explore feedback', 'ಅಭಿಪ್ರಾಯಗಳನ್ನು ನೋಡಿ', 'फ़ीडबैक देखें', 'フィードバックを見る'],
  ['Real experiences. Better journeys.', 'ನೈಜ ಅನುಭವಗಳು. ಉತ್ತಮ ಪ್ರಯಾಣಗಳು.', 'सच्चे अनुभव। बेहतर सफ़र।', 'リアルな体験。より良い旅へ。'],
  ['Play motion', 'ಚಲನೆ ಪ್ರಾರಂಭಿಸಿ', 'ऐनिमेशन चलाएँ', 'アニメーションを再生'],
  ['Pause motion', 'ಚಲನೆ ವಿರಾಮಗೊಳಿಸಿ', 'ऐनिमेशन रोकें', 'アニメーションを一時停止'],
  ['The feedback lane is open', 'ಅಭಿಪ್ರಾಯಗಳಿಗೆ ದಾರಿ ತೆರೆದಿದೆ', 'फ़ीडबैक की राह खुली है', 'あなたの声を受付中'],
  ['The feedback lane', 'ಅಭಿಪ್ರಾಯಗಳ ಹಾದಿ', 'फ़ीडबैक की राह', 'フィードバックレーン'],
  ['Small details. A better drive.', 'ಸಣ್ಣ ವಿವರಗಳು. ಉತ್ತಮ ಪ್ರಯಾಣ.', 'छोटी बातें। बेहतर सफ़र।', '小さな気づき。より良いドライブ。'],
  ['PIT WALL / TEAM WORKSPACE', 'ಪಿಟ್ ವಾಲ್ / ತಂಡದ ಕಾರ್ಯಸ್ಥಳ', 'पिट वॉल / टीम कार्यक्षेत्र', 'ピットウォール / チームワークスペース'],
] as const;
export const toyotaCatalog: TranslationCatalog = {
  kn: Object.fromEntries(rows.map(([en, kn]) => [en, kn])),
  hi: Object.fromEntries(rows.map(([en, , hi]) => [en, hi])),
  ja: Object.fromEntries(rows.map(([en, , , ja]) => [en, ja])),
};
