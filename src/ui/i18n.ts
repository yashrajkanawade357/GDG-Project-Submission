import type { Language } from '../sync/types';

export interface Messages {
  title: string;
  subtitle: string;
  tabLabel: (code: string) => string;
  openTab: string;
  preferences: string;
  darkMode: string;
  darkModeHint: string;
  on: string;
  off: string;
  language: string;
  languageHint: string;
  textSize: string;
  textSizeHint: string;
  preview: string;
  savedNote: string;
  monitor: string;
  latency: string;
  last: string;
  average: string;
  p95: string;
  max: string;
  samples: (count: number) => string;
  withinTarget: (percent: string) => string;
  noSamples: string;
  tabs: string;
  you: string;
  inSync: string;
  catchingUp: string;
  allAgree: string;
  someBehind: string;
  aloneHint: string;
  drill: string;
  drillHint: string;
  runDrill: string;
  needTwoTabs: string;
  drillWrites: (count: number) => string;
  drillResult: (value: string, tab: string) => string;
  activity: string;
  noActivity: string;
  fromTab: (tab: string) => string;
  fromStorage: string;
  here: string;
}

/** Each language's name written in that language, for the selector. */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  hi: 'हिन्दी',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  ja: '日本語',
};

const en: Messages = {
  title: 'Settings Sync',
  subtitle: 'Change a preference in any tab. Every other open tab follows within milliseconds.',
  tabLabel: (code) => `Tab ${code}`,
  openTab: 'Open another tab',
  preferences: 'Preferences',
  darkMode: 'Dark mode',
  darkModeHint: 'Switch between a light and a dark theme.',
  on: 'On',
  off: 'Off',
  language: 'Language',
  languageHint: 'Used for every label in the app.',
  textSize: 'Text size',
  textSizeHint: 'Scales all text in the app.',
  preview: 'This is how text looks at this size.',
  savedNote: 'Saved in this browser and restored the next time you open the app.',
  monitor: 'Sync monitor',
  latency: 'Cross-tab latency',
  last: 'Last',
  average: 'Average',
  p95: 'p95',
  max: 'Max',
  samples: (n) => (n === 1 ? '1 sample' : `${n} samples`),
  withinTarget: (pct) => `${pct} delivered within 100 ms`,
  noSamples: 'Change a setting in another tab to measure delivery time here.',
  tabs: 'Open tabs',
  you: 'you',
  inSync: 'in sync',
  catchingUp: 'catching up',
  allAgree: 'All tabs hold identical settings.',
  someBehind: 'Some tabs are still catching up.',
  aloneHint: 'Only this tab is open. Open another one to watch them sync.',
  drill: 'Conflict drill',
  drillHint:
    'Every open tab writes a different text size at the same instant. They must all settle on the same winner.',
  runDrill: 'Run drill',
  needTwoTabs: 'Open a second tab to run the drill.',
  drillWrites: (n) => `${n} simultaneous writes`,
  drillResult: (value, tab) => `Winner: ${value} from ${tab}. The newest stamp wins; the tab id breaks ties.`,
  activity: 'Activity',
  noActivity: 'Nothing yet. Try changing a setting.',
  fromTab: (tab) => `from ${tab}`,
  fromStorage: 'from storage',
  here: 'here',
};

const hi: Messages = {
  title: 'सेटिंग्स सिंक',
  subtitle: 'किसी भी टैब में पसंद बदलें। बाकी सभी खुले टैब मिलीसेकंड में अपडेट हो जाते हैं।',
  tabLabel: (code) => `टैब ${code}`,
  openTab: 'एक और टैब खोलें',
  preferences: 'प्राथमिकताएँ',
  darkMode: 'डार्क मोड',
  darkModeHint: 'हल्की और गहरी थीम के बीच बदलें।',
  on: 'चालू',
  off: 'बंद',
  language: 'भाषा',
  languageHint: 'ऐप के सभी लेबल इसी भाषा में दिखते हैं।',
  textSize: 'टेक्स्ट का आकार',
  textSizeHint: 'ऐप के सारे टेक्स्ट का आकार बदलता है।',
  preview: 'इस आकार में टेक्स्ट ऐसा दिखता है।',
  savedNote: 'इस ब्राउज़र में सेव रहता है और अगली बार ऐप खोलने पर वापस आ जाता है।',
  monitor: 'सिंक मॉनिटर',
  latency: 'टैब के बीच देरी',
  last: 'आख़िरी',
  average: 'औसत',
  p95: 'p95',
  max: 'अधिकतम',
  samples: (n) => `${n} माप`,
  withinTarget: (pct) => `${pct} बदलाव 100 ms के भीतर पहुँचे`,
  noSamples: 'यहाँ समय मापने के लिए किसी दूसरे टैब में सेटिंग बदलें।',
  tabs: 'खुले टैब',
  you: 'आप',
  inSync: 'सिंक में',
  catchingUp: 'अपडेट हो रहा है',
  allAgree: 'सभी टैब में सेटिंग्स एक जैसी हैं।',
  someBehind: 'कुछ टैब अभी अपडेट हो रहे हैं।',
  aloneHint: 'अभी सिर्फ़ यही टैब खुला है। सिंक देखने के लिए एक और टैब खोलें।',
  drill: 'कॉन्फ़्लिक्ट ड्रिल',
  drillHint:
    'हर खुला टैब एक ही पल में अलग टेक्स्ट आकार लिखता है। सभी टैब को एक ही विजेता पर पहुँचना होगा।',
  runDrill: 'ड्रिल चलाएँ',
  needTwoTabs: 'ड्रिल चलाने के लिए दूसरा टैब खोलें।',
  drillWrites: (n) => `${n} बदलाव एक साथ लिखे गए`,
  drillResult: (value, tab) =>
    `विजेता: ${tab} से ${value}। सबसे नया स्टैम्प जीतता है; बराबरी होने पर टैब आईडी फ़ैसला करती है।`,
  activity: 'गतिविधि',
  noActivity: 'अभी कुछ नहीं। कोई सेटिंग बदलकर देखें।',
  fromTab: (tab) => `${tab} से`,
  fromStorage: 'स्टोरेज से',
  here: 'यहाँ',
};

const es: Messages = {
  title: 'Ajustes sincronizados',
  subtitle: 'Cambia una preferencia en cualquier pestaña. Las demás pestañas abiertas la siguen en milisegundos.',
  tabLabel: (code) => `Pestaña ${code}`,
  openTab: 'Abrir otra pestaña',
  preferences: 'Preferencias',
  darkMode: 'Modo oscuro',
  darkModeHint: 'Alterna entre un tema claro y uno oscuro.',
  on: 'Activado',
  off: 'Desactivado',
  language: 'Idioma',
  languageHint: 'Se usa en todas las etiquetas de la aplicación.',
  textSize: 'Tamaño del texto',
  textSizeHint: 'Ajusta todo el texto de la aplicación.',
  preview: 'Así se ve el texto con este tamaño.',
  savedNote: 'Se guarda en este navegador y se restaura la próxima vez que abras la aplicación.',
  monitor: 'Monitor de sincronización',
  latency: 'Latencia entre pestañas',
  last: 'Última',
  average: 'Media',
  p95: 'p95',
  max: 'Máx.',
  samples: (n) => (n === 1 ? '1 muestra' : `${n} muestras`),
  withinTarget: (pct) => `${pct} entregado en menos de 100 ms`,
  noSamples: 'Cambia un ajuste en otra pestaña para medir aquí el tiempo de entrega.',
  tabs: 'Pestañas abiertas',
  you: 'tú',
  inSync: 'sincronizada',
  catchingUp: 'actualizando',
  allAgree: 'Todas las pestañas tienen los mismos ajustes.',
  someBehind: 'Algunas pestañas aún se están actualizando.',
  aloneHint: 'Solo está abierta esta pestaña. Abre otra para verlas sincronizarse.',
  drill: 'Simulacro de conflicto',
  drillHint:
    'Cada pestaña abierta escribe un tamaño de texto distinto en el mismo instante. Todas deben quedarse con el mismo ganador.',
  runDrill: 'Iniciar simulacro',
  needTwoTabs: 'Abre una segunda pestaña para iniciar el simulacro.',
  drillWrites: (n) => `${n} escrituras simultáneas`,
  drillResult: (value, tab) =>
    `Ganador: ${value} de ${tab}. Gana la marca más reciente; el id de la pestaña resuelve los empates.`,
  activity: 'Actividad',
  noActivity: 'Nada todavía. Prueba a cambiar un ajuste.',
  fromTab: (tab) => `desde ${tab}`,
  fromStorage: 'desde el almacenamiento',
  here: 'aquí',
};

const fr: Messages = {
  title: 'Réglages synchronisés',
  subtitle:
    'Modifiez une préférence dans n’importe quel onglet : les autres onglets ouverts suivent en quelques millisecondes.',
  tabLabel: (code) => `Onglet ${code}`,
  openTab: 'Ouvrir un autre onglet',
  preferences: 'Préférences',
  darkMode: 'Mode sombre',
  darkModeHint: 'Basculez entre un thème clair et un thème sombre.',
  on: 'Activé',
  off: 'Désactivé',
  language: 'Langue',
  languageHint: 'Utilisée pour tous les libellés de l’application.',
  textSize: 'Taille du texte',
  textSizeHint: 'Ajuste tout le texte de l’application.',
  preview: 'Voici le rendu du texte à cette taille.',
  savedNote: 'Enregistré dans ce navigateur et restauré à la prochaine ouverture de l’application.',
  monitor: 'Moniteur de synchronisation',
  latency: 'Latence entre onglets',
  last: 'Dernière',
  average: 'Moyenne',
  p95: 'p95',
  max: 'Max.',
  samples: (n) => (n === 1 ? '1 mesure' : `${n} mesures`),
  withinTarget: (pct) => `${pct} livrés en moins de 100 ms`,
  noSamples: 'Modifiez un réglage dans un autre onglet pour mesurer ici le délai de livraison.',
  tabs: 'Onglets ouverts',
  you: 'vous',
  inSync: 'synchronisé',
  catchingUp: 'mise à jour',
  allAgree: 'Tous les onglets ont des réglages identiques.',
  someBehind: 'Certains onglets sont encore en cours de mise à jour.',
  aloneHint: 'Seul cet onglet est ouvert. Ouvrez-en un autre pour les voir se synchroniser.',
  drill: 'Exercice de conflit',
  drillHint:
    'Chaque onglet ouvert écrit une taille de texte différente au même instant. Tous doivent retenir le même gagnant.',
  runDrill: 'Lancer l’exercice',
  needTwoTabs: 'Ouvrez un deuxième onglet pour lancer l’exercice.',
  drillWrites: (n) => `${n} écritures simultanées`,
  drillResult: (value, tab) =>
    `Gagnant : ${value} depuis ${tab}. L’horodatage le plus récent l’emporte ; l’identifiant d’onglet départage les égalités.`,
  activity: 'Activité',
  noActivity: 'Rien pour l’instant. Essayez de modifier un réglage.',
  fromTab: (tab) => `depuis ${tab}`,
  fromStorage: 'depuis le stockage',
  here: 'ici',
};

const de: Messages = {
  title: 'Einstellungs-Sync',
  subtitle:
    'Ändere eine Einstellung in einem beliebigen Tab – alle anderen offenen Tabs folgen innerhalb von Millisekunden.',
  tabLabel: (code) => `Tab ${code}`,
  openTab: 'Weiteren Tab öffnen',
  preferences: 'Einstellungen',
  darkMode: 'Dunkelmodus',
  darkModeHint: 'Wechsle zwischen hellem und dunklem Design.',
  on: 'An',
  off: 'Aus',
  language: 'Sprache',
  languageHint: 'Gilt für alle Beschriftungen der App.',
  textSize: 'Textgröße',
  textSizeHint: 'Skaliert den gesamten Text der App.',
  preview: 'So sieht Text in dieser Größe aus.',
  savedNote: 'In diesem Browser gespeichert und beim nächsten Öffnen der App wiederhergestellt.',
  monitor: 'Sync-Monitor',
  latency: 'Latenz zwischen Tabs',
  last: 'Zuletzt',
  average: 'Mittel',
  p95: 'p95',
  max: 'Max.',
  samples: (n) => (n === 1 ? '1 Messung' : `${n} Messungen`),
  withinTarget: (pct) => `${pct} innerhalb von 100 ms zugestellt`,
  noSamples: 'Ändere eine Einstellung in einem anderen Tab, um hier die Zustellzeit zu messen.',
  tabs: 'Offene Tabs',
  you: 'du',
  inSync: 'synchron',
  catchingUp: 'wird aktualisiert',
  allAgree: 'Alle Tabs haben identische Einstellungen.',
  someBehind: 'Einige Tabs werden noch aktualisiert.',
  aloneHint: 'Nur dieser Tab ist offen. Öffne einen weiteren, um die Synchronisierung zu sehen.',
  drill: 'Konflikt-Test',
  drillHint:
    'Jeder offene Tab schreibt im selben Moment eine andere Textgröße. Alle müssen sich auf denselben Gewinner einigen.',
  runDrill: 'Test starten',
  needTwoTabs: 'Öffne einen zweiten Tab, um den Test zu starten.',
  drillWrites: (n) => `${n} gleichzeitige Schreibvorgänge`,
  drillResult: (value, tab) =>
    `Gewinner: ${value} von ${tab}. Der neueste Zeitstempel gewinnt; bei Gleichstand entscheidet die Tab-ID.`,
  activity: 'Aktivität',
  noActivity: 'Noch nichts. Ändere testweise eine Einstellung.',
  fromTab: (tab) => `von ${tab}`,
  fromStorage: 'aus dem Speicher',
  here: 'hier',
};

const ja: Messages = {
  title: '設定の同期',
  subtitle: 'どのタブで設定を変えても、開いている他のタブが数ミリ秒で追従します。',
  tabLabel: (code) => `タブ ${code}`,
  openTab: '別のタブを開く',
  preferences: '設定',
  darkMode: 'ダークモード',
  darkModeHint: 'ライトテーマとダークテーマを切り替えます。',
  on: 'オン',
  off: 'オフ',
  language: '言語',
  languageHint: 'アプリ内のすべての表示に使われます。',
  textSize: '文字サイズ',
  textSizeHint: 'アプリ内のすべての文字の大きさを変えます。',
  preview: 'この大きさだと文字はこう見えます。',
  savedNote: 'このブラウザに保存され、次にアプリを開いたときに復元されます。',
  monitor: '同期モニター',
  latency: 'タブ間の遅延',
  last: '直近',
  average: '平均',
  p95: 'p95',
  max: '最大',
  samples: (n) => `${n} 件の計測`,
  withinTarget: (pct) => `${pct} が 100 ms 以内に到達`,
  noSamples: '別のタブで設定を変えると、ここに到達時間が表示されます。',
  tabs: '開いているタブ',
  you: '自分',
  inSync: '同期済み',
  catchingUp: '更新中',
  allAgree: 'すべてのタブの設定が一致しています。',
  someBehind: '一部のタブはまだ更新中です。',
  aloneHint: '開いているのはこのタブだけです。別のタブを開くと同期の様子を確認できます。',
  drill: '競合テスト',
  drillHint:
    '開いているすべてのタブが同じ瞬間に異なる文字サイズを書き込みます。最終的に全タブが同じ勝者に揃う必要があります。',
  runDrill: 'テストを実行',
  needTwoTabs: 'テストを実行するには 2 つ目のタブを開いてください。',
  drillWrites: (n) => `同時書き込み ${n} 件`,
  drillResult: (value, tab) =>
    `勝者: ${tab} の ${value}。最も新しいスタンプが勝ち、同時刻の場合はタブ ID で決まります。`,
  activity: 'アクティビティ',
  noActivity: 'まだ何もありません。設定を変えてみてください。',
  fromTab: (tab) => `${tab} から`,
  fromStorage: 'ストレージから',
  here: 'このタブ',
};

export const MESSAGES: Record<Language, Messages> = { en, hi, es, fr, de, ja };

/** Message keys that are plain strings, so they can be bound to elements with data-i18n. */
export type StaticKey = { [K in keyof Messages]: Messages[K] extends string ? K : never }[keyof Messages];
