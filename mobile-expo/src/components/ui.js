import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StatusBar, Text, TextInput, View, useWindowDimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../theme/colors.js';
import { styles } from '../theme/styles.js';
import { ROLE_LABELS, statusLabel } from '../constants.js';
import { focusedScrollOffset, multilineBounds } from '../services/keyboardLayout.js';

export const OperationContext = createContext(false);
export const FieldFocusContext = createContext({ focusField: () => {}, viewportHeight: 800 });

export function Button({ label, onPress, variant = 'primary', disabled = false, compact = false }) {
  const processing = useContext(OperationContext);
  disabled = disabled || processing;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy: processing }} accessibilityLabel={label} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.button, styles[`button_${variant}`], compact && styles.buttonCompact, disabled && styles.disabled, pressed && !disabled && styles.pressed]}>
      <Text style={[styles.buttonText, variant !== 'primary' && styles[`buttonText_${variant}`]]}>{label}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, placeholder, secureTextEntry, keyboardType, multiline = false }) {
  const input = useRef(null);
  const { focusField, viewportHeight } = useContext(FieldFocusContext);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput ref={input} value={String(value ?? '')} onChangeText={onChangeText} placeholder={placeholder}
        onFocus={() => focusField(input.current)} onBlur={() => focusField(null)}
        placeholderTextColor={colors.muted} secureTextEntry={secureTextEntry} keyboardType={keyboardType} disableFullscreenUI
        accessibilityLabel={label} autoCapitalize={keyboardType === 'email-address' ? 'none' : 'sentences'} autoCorrect={!secureTextEntry && keyboardType !== 'email-address'} multiline={multiline} style={[styles.input, multiline && styles.multiline, multiline && multilineBounds(viewportHeight)]} />
    </View>
  );
}

export function Card({ children, accent = false }) {
  return <View style={[styles.card, accent && styles.cardAccent]}>{children}</View>;
}

export function Badge({ children, tone = 'info' }) {
  return <View style={[styles.badge, styles[`badge_${tone}`]]}><Text style={styles.badgeText}>{children}</Text></View>;
}

export function Logo({ light = false }) {
  return (
    <View style={styles.logoWrap}>
      <Image
  accessible accessibilityRole="image" accessibilityLabel="Universidade de Fortaleza"
  source={require('../../assets/unifor-logo.png')}
  resizeMode="contain"
  style={styles.uniforLogo}
/>
      <View collapsable={false} accessible={false} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.appMark}><Image source={require('../../assets/monimob-book.png')} accessible={false} style={{width: 36, height: 36}} resizeMode="contain" /></View>
      <Text accessibilityRole="header" style={[styles.logoTitle, light && styles.lightText]}>MoniMob</Text>
      <Text style={[styles.logoSubtitle, light && styles.lightMuted]}>Monitoria universitária em um só lugar</Text>
    </View>
  );
}

export function Header({ title, subtitle, onBack, role }) {
  const processing = useContext(OperationContext);
  const { width, fontScale } = useWindowDimensions();
  const stackedRole = width < 360 || (width < 600 && fontScale >= 1.5);
  return (
    <View testID="screen-header" style={styles.header}>
      {processing ? <View accessibilityLiveRegion="polite" style={styles.processing}><Text style={styles.cardBody}>Salvando…</Text></View> : null}
      <View style={styles.headerRow}>
        {onBack ? <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={onBack} style={styles.back}><Text allowFontScaling={false} style={styles.backText}>‹</Text></Pressable> : <View style={styles.backPlaceholder} />}
        <View style={styles.headerCopy}><Text accessibilityRole="header" style={styles.headerTitle}>{title}</Text>{subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}{role && stackedRole ? <View style={styles.headerRole}><Badge>{ROLE_LABELS[role]}</Badge></View> : null}</View>
        {role && !stackedRole ? <View style={styles.headerRoleSide}><Badge>{ROLE_LABELS[role]}</Badge></View> : <View style={styles.backPlaceholder} />}
      </View>
    </View>
  );
}

export function Screen({ title, subtitle, onBack, role, children, footer }) {
  const { width, height, fontScale } = useWindowDimensions();
  const [keyboardVisible, setKeyboardVisible] = useState(Keyboard.isVisible());
  const scroll = useRef(null);
  const focusedField = useRef(null);
  const focusTimer = useRef(null);
  const scrollOffset = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(height);
  const scrollFocusedField = () => {
    clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => {
      const input = focusedField.current;
      const container = scroll.current;
      if (!Keyboard.isVisible() || !input?.isFocused?.() || !container) return;
      container.measureInWindow((x, top, w, visibleHeight) => {
        input.measureInWindow((ix, inputTop, iw, inputHeight) => {
          if (focusedField.current !== input || scroll.current !== container || !input.isFocused() || !Keyboard.isVisible()) return;
          const y = focusedScrollOffset({ offset: scrollOffset.current, viewportTop: top, viewportHeight: visibleHeight,
            inputTop, inputHeight, keyboardTop: Keyboard.metrics()?.screenY });
          container.scrollTo({ y, animated: true });
        });
      });
    }, 120);
  };
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => { setKeyboardVisible(true); scrollFocusedField(); });
    const hide = Keyboard.addListener('keyboardDidHide', () => { clearTimeout(focusTimer.current); setKeyboardVisible(false); });
    return () => { show.remove(); hide.remove(); clearTimeout(focusTimer.current); };
  }, []);
  const focusField = input => { focusedField.current = input; if (input) scrollFocusedField(); };
  // Keep the header in the same scroll tree so a keyboard/rotation change does
  // not remount the focused form. Short viewports can scroll the header away.
  const scrollHeader = keyboardVisible || height < 540 || (height < 700 && fontScale >= 1.5);
  const gutter = width < 360 ? 12 : width >= 600 ? 24 : 18;
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <FieldFocusContext.Provider value={{ focusField, viewportHeight }}>
          <ScrollView testID="screen-scroll" ref={scroll} style={styles.flex} contentContainerStyle={styles.scrollContent}
            onScroll={event => { scrollOffset.current = event.nativeEvent.contentOffset.y; }} scrollEventThrottle={16}
            onLayout={event => { setViewportHeight(event.nativeEvent.layout.height); if (Keyboard.isVisible()) scrollFocusedField(); }}
            stickyHeaderIndices={scrollHeader ? undefined : [0]} keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'} scrollsChildToFocus>
            <Header key="header" title={title} subtitle={subtitle} onBack={onBack} role={role} />
            <View testID="screen-content" key="content" style={[styles.content, { paddingHorizontal: gutter }]}>{children}</View>
          </ScrollView>
          {!keyboardVisible ? footer : null}
        </FieldFocusContext.Provider>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function SectionTitle({ children, action, onAction }) {
  return <View style={styles.sectionTitleRow}><Text accessibilityRole="header" style={styles.sectionTitle}>{children}</Text>{action ? <Pressable accessibilityRole="button" accessibilityLabel={action} onPress={onAction} style={styles.sectionAction}><Text style={styles.link}>{action}</Text></Pressable> : null}</View>;
}

export function SessionCard({ session, state, onDetails, actionLabel, onAction }) {
  const discipline = state.disciplines.find(item => item.id === session.disciplineId);
  const monitor = state.users.find(item => item.id === session.monitorId);
  const count = session.reservedCount ?? state.reservations.filter(item => item.sessionId === session.id && item.status === 'confirmed').length;
  const statusTone = session.status === 'approved' ? 'success' : session.status === 'rejected' ? 'error' : 'warning';
  return (
    <Card>
      <View style={styles.sessionEyebrow}>
        <Text style={styles.sessionCode}>{discipline?.code}</Text>
        {session.status !== 'approved' ? <Badge tone={statusTone}>{statusLabel(session.status)}</Badge> : null}
      </View>
      <Text style={styles.cardTitle}>{discipline?.name}</Text>
      <Text style={styles.cardBody}>{session.topic}</Text>
      <Text style={styles.sessionMeta}>{session.date}  ·  {session.time}  ·  {session.modality}</Text>
      <Text style={styles.meta}>{monitor?.name}  ·  {count}/{session.capacity} vagas</Text>
      <View style={styles.sessionActions}>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver detalhes da monitoria" onPress={() => onDetails(session)} style={styles.textAction}>
          <Text style={styles.link}>Ver detalhes  ›</Text>
        </Pressable>
        {actionLabel ? <Button compact variant="ghost" label={actionLabel} onPress={() => onAction(session)} /> : null}
      </View>
    </Card>
  );
}

export function BottomNav({ role, go, activeRoute }) {
  const items = role === 'monitor'
    ? [['monitorDashboard', 'Início', '⌂'], ['manageSessions', 'Sessões', '▤'], ['participants', 'Presença', '✓'], ['more', 'Mais', '•••']]
    : role === 'professor'
      ? [['professorDashboard', 'Início', '⌂'], ['approvals', 'Validar', '✓'], ['reports', 'Relatórios', '▥'], ['more', 'Mais', '•••']]
      : [['home', 'Início', '⌂'], ['catalog', 'Buscar', '⌕'], ['agenda', 'Agenda', '▦'], ['more', 'Mais', '•••']];
  return (
    <View style={styles.navSurface}>
      <View testID="bottom-navigation" style={styles.nav}>
        {items.map(([route, label, symbol]) => {
          const active = activeRoute === route;
          return (
            <Pressable key={route} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={() => go(route)} style={styles.navItem}>
              <Text allowFontScaling={false} style={[styles.navIcon, active && styles.navIconActive]}>{symbol}</Text>
              <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function Choice({ selected, label, onPress }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} accessibilityLabel={label} onPress={onPress} style={[styles.choice, selected && styles.choiceSelected]}><Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text></Pressable>;
}

export function Info({ label, value }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.cardBody}>{value}</Text>
    </View>
  );
}

export function Kpi({ label, value }) { return <View style={styles.kpi}><Text style={styles.kpiValue}>{value}</Text><Text style={styles.kpiLabel}>{label}</Text></View>; }

export function MenuLink({ title, subtitle, onPress }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.menuLink, pressed && styles.menuLinkPressed]}>
      <View style={styles.menuLinkCopy}>
        <Text style={styles.menuLinkTitle}>{title}</Text>
        <Text style={styles.menuLinkSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.menuLinkArrow}>›</Text>
    </Pressable>
  );
}
