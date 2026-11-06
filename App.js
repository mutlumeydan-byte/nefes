import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Pressable, Animated, Easing, StyleSheet, AppState, useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as Localization from 'expo-localization';
import AsyncStorage from './storage';

const IN = 4000, OUT = 6000, TOTAL = 60000;

const PALETTE = [
  { glow: '120,170,255', c1: '#dbe7ff', c2: '#8fb3ff', c3: '#4f7fe0' },
  { glow: '110,220,170', c1: '#dfffee', c2: '#7fe0b0', c3: '#2fa87a' },
  { glow: '180,140,255', c1: '#efe6ff', c2: '#b793ff', c3: '#7a52d6' },
  { glow: '255,170,110', c1: '#ffeedd', c2: '#ffb37a', c3: '#e07a3a' },
  { glow: '255,140,180', c1: '#ffe4ee', c2: '#ff9ac0', c3: '#d9558a' },
  { glow: '230,235,245', c1: '#ffffff', c2: '#e6ebf5', c3: '#a9b3c7' },
];

// tap, again, in, out, done
const L = {
  tr: ['dokun', 'tekrar', 'al', 'ver', 'bitti'],
  en: ['tap', 'again', 'in', 'out', 'done'],
  es: ['toca', 'otra vez', 'inhala', 'exhala', 'listo'],
  de: ['tippen', 'nochmal', 'ein', 'aus', 'fertig'],
  fr: ['touchez', 'encore', 'inspire', 'expire', 'fini'],
  it: ['tocca', 'ancora', 'inspira', 'espira', 'fatto'],
  pt: ['toque', 'de novo', 'inspira', 'expira', 'pronto'],
  ru: ['нажми', 'ещё', 'вдох', 'выдох', 'готово'],
  ar: ['المس', 'مجدداً', 'شهيق', 'زفير', 'انتهى'],
  hi: ['छुएँ', 'फिर से', 'साँस लें', 'छोड़ें', 'हो गया'],
  id: ['sentuh', 'lagi', 'tarik', 'buang', 'selesai'],
  ja: ['タップ', 'もう一度', '吸う', '吐く', '終わり'],
  ko: ['터치', '다시', '들숨', '날숨', '끝'],
  zh: ['点击', '再来', '吸', '呼', '完成'],
};
const LANGS = Object.keys(L);

function deviceLang() {
  try {
    const code = (Localization.getLocales()[0]?.languageCode || 'en').toLowerCase();
    return L[code] ? code : 'en';
  } catch { return 'en'; }
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const base = Math.min(width, height) * 0.33; // circle diameter at rest

  const [lang, setLang] = useState('en');
  const [color, setColor] = useState(0);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState(null);   // 'in' | 'out' | null
  const [hintKey, setHintKey] = useState(0);  // 0 tap, 1 again
  const [showDone, setShowDone] = useState(false);

  const scale = useRef(new Animated.Value(1)).current;
  const uiOpacity = useRef(new Animated.Value(1)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const doneOpacity = useRef(new Animated.Value(0)).current;
  const loopRef = useRef(null);
  const timerRef = useRef(null);
  const alive = useRef(true);

  const t = (i) => L[lang][i];
  const p = PALETTE[color];

  useEffect(() => {
    (async () => {
      try {
        const sl = await AsyncStorage.getItem('lang');
        const sc = await AsyncStorage.getItem('color');
        setLang(sl && L[sl] ? sl : deviceLang());
        const ci = parseInt(sc);
        if (!isNaN(ci) && ci >= 0 && ci < PALETTE.length) setColor(ci);
      } catch { setLang(deviceLang()); }
    })();
    return () => { alive.current = false; };
  }, []);

  const buzz = useCallback((kind) => {
    try {
      if (kind === 'in') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      else if (kind === 'out') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {}
  }, []);

  const stop = useCallback(() => {
    if (loopRef.current) { loopRef.current.stop(); loopRef.current = null; }
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }, []);

  const showUI = (on) => Animated.timing(uiOpacity, { toValue: on ? 1 : 0, duration: 600, useNativeDriver: true }).start();

  const runCycle = useCallback(() => {
    setPhase('in'); buzz('in');
    Animated.timing(wordOpacity, { toValue: 1, duration: 600, useNativeDriver: true }).start();
    const inhale = Animated.timing(scale, { toValue: 2.15, duration: IN, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    const exhale = Animated.timing(scale, { toValue: 1, duration: OUT, easing: Easing.inOut(Easing.quad), useNativeDriver: true });
    loopRef.current = inhale;
    inhale.start(({ finished }) => {
      if (!finished || !alive.current) return;
      setPhase('out'); buzz('out');
      loopRef.current = exhale;
      exhale.start(({ finished: f2 }) => { if (f2 && alive.current && loopRef.current) runCycle(); });
    });
  }, [buzz, scale, wordOpacity]);

  const finish = useCallback(() => {
    stop();
    setRunning(false); setPhase(null);
    Animated.timing(wordOpacity, { toValue: 0, duration: 600, useNativeDriver: true }).start();
    Animated.timing(scale, { toValue: 1, duration: 1500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    buzz('done');
    setTimeout(() => {
      setShowDone(true);
      Animated.timing(doneOpacity, { toValue: 1, duration: 1200, useNativeDriver: true }).start();
      setTimeout(() => {
        Animated.timing(doneOpacity, { toValue: 0, duration: 1200, useNativeDriver: true }).start(() => setShowDone(false));
        setHintKey(1); showUI(true);
      }, 2500);
    }, 1200);
  }, [stop, buzz, scale, wordOpacity, doneOpacity]);

  const begin = useCallback(() => {
    if (running) return;
    setRunning(true); showUI(false);
    doneOpacity.setValue(0); setShowDone(false);
    runCycle();
    timerRef.current = setTimeout(finish, TOTAL);
  }, [running, runCycle, finish, doneOpacity]);

  const reset = useCallback(() => {
    stop(); setRunning(false); setPhase(null);
    scale.setValue(1); wordOpacity.setValue(0);
    setHintKey(0); showUI(true);
  }, [stop, scale, wordOpacity]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active' && running) reset(); });
    return () => sub.remove();
  }, [running, reset]);

  const cycleLang = () => {
    const next = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length];
    setLang(next); AsyncStorage.setItem('lang', next).catch(() => {});
  };
  const pickColor = (i) => { setColor(i); AsyncStorage.setItem('color', String(i)).catch(() => {}); };

  return (
    <View style={styles.root}>
      <StatusBar style="light" hidden={running} />

      <Animated.View style={[styles.lang, { opacity: uiOpacity }]} pointerEvents={running ? 'none' : 'auto'}>
        <Pressable onPress={cycleLang} hitSlop={12} style={styles.langBtn}>
          <Text style={styles.langText}>{lang.toUpperCase()}</Text>
        </Pressable>
      </Animated.View>

      <Pressable onPress={begin} style={styles.stage}>
        <Animated.View style={[styles.glow, {
          width: base * 2.2, height: base * 2.2, borderRadius: base * 1.1,
          backgroundColor: `rgba(${p.glow},0.18)`, transform: [{ scale }],
        }]} />
        <Animated.View style={[styles.circle, {
          width: base, height: base, borderRadius: base / 2,
          backgroundColor: p.c2, shadowColor: `rgb(${p.glow})`, transform: [{ scale }],
        }]}>
          <View style={[styles.highlight, { width: base * 0.55, height: base * 0.55, borderRadius: base * 0.275, backgroundColor: p.c1 }]} />
          <View style={[styles.shade, { width: base, height: base, borderRadius: base / 2, borderColor: p.c3 }]} />
        </Animated.View>
        <Animated.Text style={[styles.word, { opacity: wordOpacity, top: base * 1.6 }]}>
          {phase === 'in' ? t(2) : phase === 'out' ? t(3) : ''}
        </Animated.Text>
      </Pressable>

      <Animated.View style={[styles.bottom, { opacity: uiOpacity }]} pointerEvents={running ? 'none' : 'auto'}>
        <Pressable onPress={begin}><Text style={styles.hint}>{t(hintKey)}</Text></Pressable>
        <View style={styles.colors}>
          {PALETTE.map((c, i) => (
            <Pressable key={i} onPress={() => pickColor(i)} hitSlop={8}
              style={[styles.dot, { backgroundColor: c.c2 }, i === color && styles.dotOn]} />
          ))}
        </View>
      </Animated.View>

      {showDone && (
        <Animated.View style={[styles.doneWrap, { opacity: doneOpacity }]} pointerEvents="none">
          <Text style={styles.done}>{t(4)}</Text>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0b0f1a', alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute' },
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    shadowOpacity: 0.45, shadowRadius: 40, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  highlight: { position: 'absolute', top: '8%', left: '12%', opacity: 0.75 },
  shade: { position: 'absolute', borderWidth: 0, opacity: 0.35 },
  word: { position: 'absolute', color: '#cdd5e6', fontSize: 18, letterSpacing: 5, textTransform: 'uppercase' },
  bottom: { position: 'absolute', bottom: '8%', width: '100%', alignItems: 'center', gap: 28 },
  hint: { color: '#cdd5e6', opacity: 0.45, fontSize: 14, letterSpacing: 4, textTransform: 'uppercase', padding: 12 },
  colors: { flexDirection: 'row', gap: 18 },
  dot: { width: 22, height: 22, borderRadius: 11, opacity: 0.55, borderWidth: 2, borderColor: 'transparent' },
  dotOn: { opacity: 1, transform: [{ scale: 1.35 }], borderColor: 'rgba(255,255,255,0.7)' },
  lang: { position: 'absolute', top: 56, right: 20, zIndex: 2 },
  langBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 999, paddingVertical: 7, paddingHorizontal: 10 },
  langText: { color: '#cdd5e6', opacity: 0.6, fontSize: 12, letterSpacing: 2 },
  doneWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  done: { color: '#cdd5e6', fontSize: 24, letterSpacing: 8, textTransform: 'uppercase' },
});
