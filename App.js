import 'react-native-url-polyfill/auto';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, ScrollView, Alert, StyleSheet, ActivityIndicator, Switch, Modal, RefreshControl } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as WebBrowser from 'expo-web-browser';
import Svg, { Path, Rect, Circle } from 'react-native-svg';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config';

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false } });
const NAVY = '#0B1F3A', NAVY2 = '#14305a', GOLD = '#D4AF37', WHITE = '#FFFFFF', MUTED = '#8fa0b8';
const NETS = [{ id: 'mtn', name: 'MTN', c: '#FFCC00' }, { id: 'airtel', name: 'Airtel', c: '#E4002B' }, { id: 'glo', name: 'Glo', c: '#50B848' }, { id: '9mobile', name: '9mobile', c: '#00A650' }];
const CATS = ['daily', 'weekly', 'monthly'];
const OCOLS = 'id,user_id,plan_id,network,plan_name,phone,amount,request_id,status,provider_ref,refunded,created_at';
const naira = n => '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 2 });
const when = d => new Date(d).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
const stColor = st => st === 'success' ? '#3ecf8e' : st === 'failed' ? '#ff6b6b' : GOLD;

async function call(fn, body) {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
  return data;
}
const Ctx = createContext(null);
const useApp = () => useContext(Ctx);

const Logo = ({ size = 64 }) => (
  <Svg width={size} height={size} viewBox="0 0 100 100">
    <Rect width="100" height="100" rx="22" fill={NAVY2} />
    <Path d="M22 44 Q50 16 78 44" stroke={GOLD} strokeWidth="7" fill="none" strokeLinecap="round" />
    <Path d="M33 56 Q50 40 67 56" stroke={WHITE} strokeWidth="7" fill="none" strokeLinecap="round" />
    <Circle cx="50" cy="71" r="7" fill={GOLD} />
  </Svg>
);
const Brand = () => (<View style={{ alignItems: 'center', marginVertical: 18 }}><Logo /><Text style={s.brand}>ASHMAN ASHRAF</Text><Text style={s.tag}>DATA • FAST • RELIABLE</Text></View>);
const Btn = ({ t, onPress, ghost, busy, style }) => (
  <TouchableOpacity disabled={busy} style={[s.btn, ghost && s.ghost, style]} onPress={onPress}>
    {busy ? <ActivityIndicator color={ghost ? GOLD : NAVY} /> : <Text style={ghost ? s.btnT2 : s.btnT}>{t}</Text>}
  </TouchableOpacity>);
const Field = p => <TextInput placeholderTextColor="#889" autoCapitalize="none" {...p} style={[s.input, p.style]} />;

/* ---------------- Auth ---------------- */
function Auth() {
  const [mode, setMode] = useState('in'), [email, setEmail] = useState(''), [pw, setPw] = useState(''), [name, setName] = useState(''), [phone, setPhone] = useState(''), [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    const r = mode === 'in' ? await sb.auth.signInWithPassword({ email: email.trim(), password: pw })
      : await sb.auth.signUp({ email: email.trim(), password: pw, options: { data: { full_name: name, phone } } });
    setBusy(false);
    if (r.error) Alert.alert('Error', r.error.message);
    else if (mode === 'up' && !r.data.session) Alert.alert('Check your email', 'Confirm your email, then sign in.');
  };
  const reset = async () => { if (!email) return Alert.alert('Enter your email first'); const { error } = await sb.auth.resetPasswordForEmail(email.trim()); Alert.alert(error ? error.message : 'Password reset email sent'); };
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 24, justifyContent: 'center', flexGrow: 1 }}>
      <Brand />
      {mode === 'up' && <><Field placeholder="Full name" autoCapitalize="words" value={name} onChangeText={setName} /><Field placeholder="Phone number" keyboardType="phone-pad" value={phone} onChangeText={setPhone} /></>}
      <Field placeholder="Email" keyboardType="email-address" value={email} onChangeText={setEmail} />
      <Field placeholder="Password (min 8 characters)" secureTextEntry value={pw} onChangeText={setPw} />
      <Btn t={mode === 'in' ? 'SIGN IN' : 'CREATE ACCOUNT'} onPress={go} busy={busy} />
      <TouchableOpacity onPress={() => setMode(mode === 'in' ? 'up' : 'in')}><Text style={s.link}>{mode === 'in' ? 'New here? Create account' : 'Have an account? Sign in'}</Text></TouchableOpacity>
      {mode === 'in' && <TouchableOpacity onPress={reset}><Text style={[s.link, { color: MUTED }]}>Forgot password?</Text></TouchableOpacity>}
    </ScrollView>);
}

/* ---------------- Receipt ---------------- */
function Receipt({ order, onClose, onUpdate }) {
  const [busy, setBusy] = useState(false);
  if (!order) return null;
  const check = async () => { setBusy(true); try { const r = await call('buy-data', { action: 'requery', request_id: order.request_id }); onUpdate && onUpdate(r.order); } catch (e) { Alert.alert(e.message); } setBusy(false); };
  const Row = ({ k, v }) => <View style={s.rrow}><Text style={s.cardA}>{k}</Text><Text style={s.rv}>{v}</Text></View>;
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.modalBg}><View style={s.sheet}>
        <Text style={[s.h1, { textAlign: 'center', color: stColor(order.status) }]}>{order.status === 'success' ? 'Successful' : order.status === 'failed' ? 'Failed' : 'Processing'}</Text>
        <Text style={[s.big, { textAlign: 'center' }]}>{naira(order.amount)}</Text>
        <Row k="Network" v={order.network.toUpperCase()} /><Row k="Plan" v={order.plan_name} /><Row k="Phone" v={order.phone} />
        <Row k="Date" v={when(order.created_at)} /><Row k="Reference" v={order.request_id} />
        {order.provider_ref && <Row k="Provider ref" v={order.provider_ref} />}
        {order.status === 'failed' && <Text style={[s.body, { color: '#3ecf8e' }]}>{order.refunded ? 'Refunded to your wallet.' : 'Refund in progress.'}</Text>}
        {order.status === 'pending' && <Btn t="CHECK STATUS" onPress={check} busy={busy} />}
        <Btn t="CLOSE" ghost onPress={onClose} />
      </View></View>
    </Modal>);
}

/* ---------------- Home ---------------- */
function Home({ navigation }) {
  const { profile, wallet, maintenance, refresh } = useApp();
  const [orders, setOrders] = useState([]), [rec, setRec] = useState(null), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setBusy(true); await refresh(); setOrders((await sb.from('orders').select(OCOLS).order('created_at', { ascending: false }).limit(5)).data || []); setBusy(false); }, []);
  useEffect(() => navigation.addListener('focus', load), [navigation]);
  return (
    <ScrollView style={s.screen} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={GOLD} />}>
      <Text style={s.hello}>Hello, {profile?.full_name || profile?.email?.split('@')[0]}</Text>
      {maintenance && <Text style={s.warn}>Service is under maintenance. Purchases are paused.</Text>}
      <View style={s.wallet}>
        <Text style={s.cardA}>Wallet balance</Text>
        <Text style={s.big}>{naira(wallet)}</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Btn t="+ FUND WALLET" onPress={() => navigation.navigate('Wallet')} style={{ flex: 1 }} />
          <Btn t="BUY DATA" ghost onPress={() => navigation.navigate('Buy Data')} style={{ flex: 1 }} />
        </View>
      </View>
      <Text style={s.h2}>Recent transactions</Text>
      {orders.length === 0 && <Text style={[s.body, { marginHorizontal: 16 }]}>No transactions yet.</Text>}
      {orders.map(o => <OrderRow key={o.id} o={o} onPress={() => setRec(o)} />)}
      <Receipt order={rec} onClose={() => setRec(null)} onUpdate={o => { setRec(o); load(); }} />
    </ScrollView>);
}
const OrderRow = ({ o, onPress }) => (
  <TouchableOpacity style={s.item} onPress={onPress}>
    <View style={{ flex: 1 }}><Text style={s.cardT}>{o.network.toUpperCase()} · {o.plan_name}</Text><Text style={s.cardA}>{o.phone} · {when(o.created_at)}</Text></View>
    <View style={{ alignItems: 'flex-end' }}><Text style={s.cardT}>{naira(o.amount)}</Text><Text style={{ color: stColor(o.status), fontSize: 12, fontWeight: '700' }}>{o.status.toUpperCase()}</Text></View>
  </TouchableOpacity>);

/* ---------------- Buy data ---------------- */
function Buy({ navigation }) {
  const { wallet, maintenance, refresh } = useApp();
  const [net, setNet] = useState('mtn'), [cat, setCat] = useState('daily'), [phone, setPhone] = useState(''), [plans, setPlans] = useState([]), [sel, setSel] = useState(null), [busy, setBusy] = useState(false), [rec, setRec] = useState(null);
  useEffect(() => { sb.from('data_plans').select('*').eq('network', net).eq('active', true).order('price').then(r => setPlans(r.data || [])); }, [net]);
  const list = plans.filter(p => p.category === cat);
  const valid = /^0[789][01]\d{8}$/.test(phone);
  const pick = p => { if (!valid) return Alert.alert('Enter a valid 11-digit phone number first'); setSel(p); };
  const confirm = async () => {
    setBusy(true);
    try { const r = await call('buy-data', { plan_id: sel.id, phone }); setSel(null); setRec(r.order); refresh(); }
    catch (e) { setSel(null); Alert.alert('Purchase failed', e.message); }
    setBusy(false);
  };
  return (
    <ScrollView style={s.screen} keyboardShouldPersistTaps="handled">
      <Text style={[s.h1, { margin: 16 }]}>Buy Data</Text>
      {maintenance && <Text style={s.warn}>Service is under maintenance. Purchases are paused.</Text>}
      <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>
        {NETS.map(n => <TouchableOpacity key={n.id} style={[s.net, net === n.id && { borderColor: GOLD, backgroundColor: NAVY2 }]} onPress={() => setNet(n.id)}>
          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: n.c, marginBottom: 4 }} /><Text style={s.cardT}>{n.name}</Text></TouchableOpacity>)}
      </View>
      <Field style={{ marginHorizontal: 16 }} placeholder="Recipient phone (08012345678)" keyboardType="number-pad" maxLength={11} value={phone} onChangeText={setPhone} />
      <View style={{ flexDirection: 'row', paddingHorizontal: 12, marginTop: 6 }}>
        {CATS.map(c => <TouchableOpacity key={c} style={[s.chip, cat === c && { backgroundColor: GOLD }]} onPress={() => setCat(c)}><Text style={[s.chipT, cat === c && { color: NAVY }]}>{c.toUpperCase()}</Text></TouchableOpacity>)}
      </View>
      {list.length === 0 && <Text style={[s.body, { margin: 16 }]}>No {cat} plans available for this network yet.</Text>}
      {list.map(p => <TouchableOpacity key={p.id} style={s.item} onPress={() => pick(p)}><Text style={[s.cardT, { flex: 1 }]}>{p.name}</Text><Text style={s.price}>{naira(p.price)}</Text></TouchableOpacity>)}
      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSel(null)}>
        <View style={s.modalBg}><View style={s.sheet}>
          <Text style={[s.h1, { textAlign: 'center' }]}>Confirm purchase</Text>
          <View style={s.rrow}><Text style={s.cardA}>Network</Text><Text style={s.rv}>{net.toUpperCase()}</Text></View>
          <View style={s.rrow}><Text style={s.cardA}>Plan</Text><Text style={s.rv}>{sel?.name}</Text></View>
          <View style={s.rrow}><Text style={s.cardA}>Phone</Text><Text style={s.rv}>{phone}</Text></View>
          <View style={s.rrow}><Text style={s.cardA}>Price</Text><Text style={s.rv}>{naira(sel?.price)}</Text></View>
          <View style={s.rrow}><Text style={s.cardA}>Wallet balance</Text><Text style={s.rv}>{naira(wallet)}</Text></View>
          {sel && wallet < sel.price
            ? <><Text style={s.warn}>Insufficient balance. Fund your wallet first.</Text><Btn t="FUND WALLET" onPress={() => { setSel(null); navigation.navigate('Wallet'); }} /></>
            : <Btn t={`PAY ${naira(sel?.price)}`} onPress={confirm} busy={busy} />}
          <Btn t="CANCEL" ghost onPress={() => setSel(null)} />
        </View></View>
      </Modal>
      <Receipt order={rec} onClose={() => setRec(null)} onUpdate={setRec} />
    </ScrollView>);
}

/* ---------------- Wallet ---------------- */
function Wallet() {
  const { wallet, refresh } = useApp();
  const [amt, setAmt] = useState(''), [busy, setBusy] = useState(false), [ledger, setLedger] = useState([]);
  const load = useCallback(async () => { await refresh(); setLedger((await sb.from('wallet_ledger').select('*').order('id', { ascending: false }).limit(50)).data || []); }, []);
  useEffect(() => { load(); }, []);
  const fund = async () => {
    setBusy(true);
    try {
      const { url, reference } = await call('paystack', { action: 'init', amount: Number(amt) });
      await WebBrowser.openBrowserAsync(url);
      const v = await call('paystack', { action: 'verify', reference });
      Alert.alert(v.ok ? 'Wallet funded' : 'Payment not confirmed yet', v.ok ? 'Your balance has been updated.' : 'If you were charged, your balance will update automatically within minutes.');
      setAmt(''); load();
    } catch (e) { Alert.alert('Error', e.message); }
    setBusy(false);
  };
  return (
    <ScrollView style={s.screen} keyboardShouldPersistTaps="handled">
      <View style={s.wallet}><Text style={s.cardA}>Wallet balance</Text><Text style={s.big}>{naira(wallet)}</Text></View>
      <Field style={{ marginHorizontal: 16 }} placeholder="Amount to fund (₦)" keyboardType="number-pad" value={amt} onChangeText={setAmt} />
      <View style={{ flexDirection: 'row', paddingHorizontal: 12 }}>{[500, 1000, 2000, 5000].map(a => <TouchableOpacity key={a} style={s.chip} onPress={() => setAmt(String(a))}><Text style={s.chipT}>{naira(a)}</Text></TouchableOpacity>)}</View>
      <View style={{ paddingHorizontal: 16 }}><Btn t="PAY WITH PAYSTACK" onPress={fund} busy={busy} /></View>
      <Text style={s.h2}>Wallet history</Text>
      {ledger.map(l => <View key={l.id} style={s.item}>
        <View style={{ flex: 1 }}><Text style={s.cardT}>{l.description}</Text><Text style={s.cardA}>{when(l.created_at)}</Text></View>
        <View style={{ alignItems: 'flex-end' }}><Text style={[s.cardT, { color: l.type === 'debit' ? '#ff6b6b' : '#3ecf8e' }]}>{l.type === 'debit' ? '-' : '+'}{naira(l.amount)}</Text><Text style={s.cardA}>bal {naira(l.balance_after)}</Text></View>
      </View>)}
    </ScrollView>);
}

/* ---------------- History / Account ---------------- */
function History() {
  const [orders, setOrders] = useState([]), [rec, setRec] = useState(null), [busy, setBusy] = useState(false);
  const load = async () => { setBusy(true); setOrders((await sb.from('orders').select(OCOLS).order('created_at', { ascending: false }).limit(100)).data || []); setBusy(false); };
  useEffect(() => { load(); }, []);
  return (
    <View style={s.screen}>
      <Text style={[s.h1, { margin: 16 }]}>Transactions</Text>
      <FlatList data={orders} keyExtractor={o => o.id} refreshControl={<RefreshControl refreshing={busy} onRefresh={load} tintColor={GOLD} />}
        ListEmptyComponent={<Text style={[s.body, { margin: 16 }]}>No transactions yet.</Text>} renderItem={({ item }) => <OrderRow o={item} onPress={() => setRec(item)} />} />
      <Receipt order={rec} onClose={() => setRec(null)} onUpdate={o => { setRec(o); load(); }} />
    </View>);
}
function Account() {
  const { profile, refresh } = useApp();
  const [name, setName] = useState(profile?.full_name || ''), [phone, setPhone] = useState(profile?.phone || ''), [pw, setPw] = useState('');
  const save = async () => { const { error } = await sb.from('profiles').update({ full_name: name, phone }).eq('id', profile.id); if (!error) refresh(); Alert.alert(error ? error.message : 'Saved'); };
  const changePw = async () => { if (pw.length < 8) return Alert.alert('Use at least 8 characters'); const { error } = await sb.auth.updateUser({ password: pw }); setPw(''); Alert.alert(error ? error.message : 'Password updated'); };
  return (
    <ScrollView style={s.screen} contentContainerStyle={{ padding: 16 }}>
      <Brand /><Text style={s.body}>{profile?.email}</Text>
      <Field placeholder="Full name" autoCapitalize="words" value={name} onChangeText={setName} /><Field placeholder="Phone" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
      <Btn t="SAVE PROFILE" onPress={save} />
      <Field placeholder="New password" secureTextEntry value={pw} onChangeText={setPw} /><Btn t="CHANGE PASSWORD" ghost onPress={changePw} />
      <Btn t="SIGN OUT" ghost onPress={() => sb.auth.signOut()} />
    </ScrollView>);
}

/* ---------------- Admin ---------------- */
function Admin() {
  const [tab, setTab] = useState('Overview');
  return (
    <View style={s.screen}>
      <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false}>
        {['Overview', 'Plans', 'Orders', 'Users', 'Settings'].map(t => <TouchableOpacity key={t} style={[s.chip, tab === t && { backgroundColor: GOLD }, { margin: 8 }]} onPress={() => setTab(t)}><Text style={[s.chipT, tab === t && { color: NAVY }]}>{t}</Text></TouchableOpacity>)}
      </ScrollView>
      {tab === 'Overview' ? <AOverview /> : tab === 'Plans' ? <APlans /> : tab === 'Orders' ? <AOrders /> : tab === 'Users' ? <AUsers /> : <ASettings />}
    </View>);
}
function AOverview() {
  const [st, setSt] = useState({}), [api, setApi] = useState(null), [markup, setMarkup] = useState('5'), [busy, setBusy] = useState('');
  const load = async () => { setSt((await sb.rpc('admin_stats')).data || {}); try { setApi(await call('admin-tools', { action: 'api-status' })); } catch {} };
  useEffect(() => { load(); sb.from('settings').select('value').eq('key', 'markup_percent').single().then(r => r.data && setMarkup(String(r.data.value))); }, []);
  const run = async (k, body) => { setBusy(k); try { Alert.alert('Done', JSON.stringify(await call('admin-tools', body))); load(); } catch (e) { Alert.alert('Error', e.message); } setBusy(''); };
  const Card = ({ k, v }) => <View style={s.stat}><Text style={s.cardA}>{k}</Text><Text style={s.price}>{v}</Text></View>;
  return (
    <ScrollView contentContainerStyle={{ padding: 12 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        <Card k="Total sales" v={naira(st.sales)} /><Card k="Sales today" v={naira(st.sales_today)} /><Card k="Profit" v={naira(st.profit)} /><Card k="User wallets" v={naira(st.wallet_total)} />
        <Card k="Users" v={st.users ?? 0} /><Card k="Orders" v={st.orders ?? 0} /><Card k="Pending" v={st.pending ?? 0} /><Card k="Failed" v={st.failed ?? 0} />
      </View>
      <Text style={s.h2}>API connections</Text>
      {api && Object.entries(api).map(([k, v]) => <View key={k} style={s.rrow}><Text style={s.cardA}>{k}</Text><Text style={[s.rv, { color: v === true ? '#3ecf8e' : v === false ? '#ff6b6b' : WHITE }]}>{v === true ? 'configured' : v === false ? 'MISSING' : String(v)}</Text></View>)}
      <Text style={s.h2}>Plans from VTpass</Text>
      <Field placeholder="Markup % on provider cost" keyboardType="decimal-pad" value={markup} onChangeText={setMarkup} />
      <Btn t="SYNC PLANS FROM VTPASS" busy={busy === 'sync'} onPress={() => run('sync', { action: 'sync-plans', markup_percent: Number(markup) })} />
      <Btn t="RECONCILE PENDING ORDERS" ghost busy={busy === 'rec'} onPress={() => run('rec', { action: 'reconcile' })} />
    </ScrollView>);
}
function APlans() {
  const [plans, setPlans] = useState([]), [net, setNet] = useState('mtn'), [edit, setEdit] = useState({});
  const load = async () => setPlans((await sb.from('data_plans').select('*').eq('network', net).order('category').order('price')).data || []);
  useEffect(() => { load(); }, [net]);
  const save = async (p, patch) => { const { error } = await sb.from('data_plans').update(patch).eq('id', p.id); if (error) Alert.alert(error.message); else { setEdit({}); load(); } };
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 8 }}>{NETS.map(n => <TouchableOpacity key={n.id} style={[s.chip, net === n.id && { backgroundColor: GOLD }]} onPress={() => setNet(n.id)}><Text style={[s.chipT, net === n.id && { color: NAVY }]}>{n.name}</Text></TouchableOpacity>)}</View>
      <FlatList data={plans} keyExtractor={p => p.id} renderItem={({ item: p }) => (
        <View style={s.item}>
          <View style={{ flex: 1 }}><Text style={s.cardT}>{p.name}</Text><Text style={s.cardA}>{p.category} · {p.variation_code}</Text></View>
          <TextInput style={[s.input, { width: 90, marginVertical: 0 }]} keyboardType="decimal-pad" defaultValue={String(p.price)} onChangeText={t => setEdit({ ...edit, [p.id]: t })} onEndEditing={() => edit[p.id] && Number(edit[p.id]) > 0 && save(p, { price: Number(edit[p.id]) })} />
          <Switch value={p.active} onValueChange={v => save(p, { active: v })} trackColor={{ true: GOLD }} />
        </View>)} />
    </View>);
}
function AOrders() {
  const [orders, setOrders] = useState([]), [f, setF] = useState('pending');
  const load = async () => { let q = sb.from('orders').select(OCOLS + ',profiles(email)').order('created_at', { ascending: false }).limit(100); if (f !== 'all') q = q.eq('status', f); setOrders((await q).data || []); };
  useEffect(() => { load(); }, [f]);
  const act = async (o, body) => { try { await call('admin-tools', { request_id: o.request_id, ...body }); load(); } catch (e) { Alert.alert(e.message); } };
  const manual = (o, status) => Alert.alert(`Mark ${status}?`, status === 'failed' ? 'This refunds the customer. Confirm on your VTpass dashboard first.' : 'Confirm delivery on your VTpass dashboard first.', [{ text: 'Cancel' }, { text: 'Confirm', onPress: () => act(o, { action: 'settle-order', status }) }]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: 8 }}>{['pending', 'failed', 'success', 'all'].map(x => <TouchableOpacity key={x} style={[s.chip, f === x && { backgroundColor: GOLD }]} onPress={() => setF(x)}><Text style={[s.chipT, f === x && { color: NAVY }]}>{x}</Text></TouchableOpacity>)}</View>
      <FlatList data={orders} keyExtractor={o => o.id} renderItem={({ item: o }) => (
        <View style={[s.item, { flexDirection: 'column', alignItems: 'stretch' }]}>
          <View style={{ flexDirection: 'row' }}><Text style={[s.cardT, { flex: 1 }]}>{o.network.toUpperCase()} · {o.plan_name}</Text><Text style={s.cardT}>{naira(o.amount)}</Text></View>
          <Text style={s.cardA}>{o.phone} · {o.profiles?.email} · {when(o.created_at)}</Text>
          <Text style={{ color: stColor(o.status), fontWeight: '700', fontSize: 12 }}>{o.status.toUpperCase()}{o.refunded ? ' · refunded' : ''} · {o.request_id}</Text>
          {o.status === 'pending' && <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={() => act(o, { action: 'requery' })}><Text style={s.tool}>requery</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => manual(o, 'success')}><Text style={[s.tool, { color: '#3ecf8e' }]}>mark success</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => manual(o, 'failed')}><Text style={[s.tool, { color: '#ff6b6b' }]}>mark failed + refund</Text></TouchableOpacity>
          </View>}
        </View>)} />
    </View>);
}
function AUsers() {
  const [users, setUsers] = useState([]), [q, setQ] = useState(''), [sel, setSel] = useState(null), [amt, setAmt] = useState('');
  const load = async () => { let r = sb.from('profiles').select('id,email,full_name,phone,is_blocked,is_admin,wallets(balance)').order('created_at', { ascending: false }).limit(100); if (q.trim()) r = r.ilike('email', `%${q.trim()}%`); setUsers((await r).data || []); };
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]);
  const adjust = async sign => { const n = Number(amt); if (!(n > 0)) return; const { error } = await sb.rpc('admin_adjust_wallet', { p_user: sel.id, p_amount: sign * n, p_note: 'manual' }); Alert.alert(error ? error.message : 'Done'); setAmt(''); setSel(null); load(); };
  const block = async () => { await sb.rpc('admin_set_blocked', { p_user: sel.id, p_blocked: !sel.is_blocked }); setSel(null); load(); };
  return (
    <View style={{ flex: 1 }}>
      <Field style={{ marginHorizontal: 12 }} placeholder="Search by email" value={q} onChangeText={setQ} />
      <FlatList data={users} keyExtractor={u => u.id} renderItem={({ item: u }) => (
        <TouchableOpacity style={s.item} onPress={() => setSel(u)}>
          <View style={{ flex: 1 }}><Text style={s.cardT}>{u.email}{u.is_admin ? ' (admin)' : ''}</Text><Text style={s.cardA}>{u.full_name} {u.phone}{u.is_blocked ? ' · BLOCKED' : ''}</Text></View>
          <Text style={s.price}>{naira(u.wallets?.balance ?? u.wallets?.[0]?.balance)}</Text>
        </TouchableOpacity>)} />
      <Modal visible={!!sel} transparent animationType="slide" onRequestClose={() => setSel(null)}>
        <View style={s.modalBg}><View style={s.sheet}>
          <Text style={s.h1}>{sel?.email}</Text>
          <Field placeholder="Amount (₦)" keyboardType="decimal-pad" value={amt} onChangeText={setAmt} />
          <View style={{ flexDirection: 'row', gap: 10 }}><Btn t="CREDIT" onPress={() => adjust(1)} style={{ flex: 1 }} /><Btn t="DEBIT" ghost onPress={() => adjust(-1)} style={{ flex: 1 }} /></View>
          <Btn t={sel?.is_blocked ? 'UNBLOCK USER' : 'BLOCK USER'} ghost onPress={block} /><Btn t="CLOSE" ghost onPress={() => setSel(null)} />
        </View></View>
      </Modal>
    </View>);
}
function ASettings() {
  const [v, setV] = useState({});
  useEffect(() => { sb.from('settings').select('*').then(r => setV(Object.fromEntries((r.data || []).map(x => [x.key, x.value])))); }, []);
  const save = async () => {
    const rows = [{ key: 'maintenance', value: !!v.maintenance }, { key: 'min_funding', value: Number(v.min_funding) }, { key: 'max_funding', value: Number(v.max_funding) }, { key: 'markup_percent', value: Number(v.markup_percent) }];
    const { error } = await sb.from('settings').upsert(rows); Alert.alert(error ? error.message : 'Settings saved');
  };
  const F = ({ k, label }) => <><Text style={s.cardA}>{label}</Text><Field keyboardType="decimal-pad" value={String(v[k] ?? '')} onChangeText={t => setV({ ...v, [k]: t })} /></>;
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <View style={s.rrow}><Text style={s.cardT}>Maintenance mode (pause purchases)</Text><Switch value={!!v.maintenance} onValueChange={x => setV({ ...v, maintenance: x })} trackColor={{ true: GOLD }} /></View>
      <F k="min_funding" label="Minimum wallet funding (₦)" /><F k="max_funding" label="Maximum wallet funding (₦)" /><F k="markup_percent" label="Default markup % for plan sync" />
      <Btn t="SAVE SETTINGS" onPress={save} />
    </ScrollView>);
}

/* ---------------- Shell ---------------- */
const Tab = createBottomTabNavigator();
export default function App() {
  const [session, setSession] = useState(undefined), [profile, setProfile] = useState(null), [wallet, setWallet] = useState(0), [maintenance, setMaintenance] = useState(false);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = sb.auth.onAuthStateChange((_, ss) => setSession(ss));
    return () => sub.subscription.unsubscribe();
  }, []);
  const refresh = useCallback(async () => {
    const { data: { user } } = await sb.auth.getUser(); if (!user) return;
    setProfile((await sb.from('profiles').select('*').eq('id', user.id).single()).data);
    setWallet(Number((await sb.from('wallets').select('balance').eq('user_id', user.id).single()).data?.balance || 0));
    setMaintenance(!!(await sb.from('settings').select('value').eq('key', 'maintenance').single()).data?.value);
  }, []);
  useEffect(() => { if (session) refresh(); else setProfile(null); }, [session]);
  if (session === undefined) return <View style={s.screen}><ActivityIndicator color={GOLD} style={{ flex: 1 }} /></View>;
  if (!session) return <Auth />;
  if (profile?.is_blocked) return <View style={[s.screen, { justifyContent: 'center', padding: 24 }]}><Brand /><Text style={s.warn}>Your account has been suspended. Contact support.</Text><Btn t="SIGN OUT" ghost onPress={() => sb.auth.signOut()} /></View>;
  return (
    <Ctx.Provider value={{ profile, wallet, maintenance, refresh }}>
      <NavigationContainer>
        <Tab.Navigator screenOptions={{ headerStyle: { backgroundColor: NAVY }, headerTintColor: GOLD, tabBarStyle: { backgroundColor: NAVY, borderTopColor: GOLD }, tabBarActiveTintColor: GOLD, tabBarInactiveTintColor: MUTED }}>
          <Tab.Screen name="Home" component={Home} options={{ title: 'ASHMAN ASHRAF' }} />
          <Tab.Screen name="Buy Data" component={Buy} />
          <Tab.Screen name="Wallet" component={Wallet} />
          <Tab.Screen name="History" component={History} />
          <Tab.Screen name="Account" component={Account} />
          {profile?.is_admin && <Tab.Screen name="Admin" component={Admin} />}
        </Tab.Navigator>
      </NavigationContainer>
    </Ctx.Provider>);
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: NAVY },
  brand: { color: GOLD, fontSize: 24, fontWeight: '800', letterSpacing: 2, marginTop: 10 }, tag: { color: WHITE, fontSize: 10, letterSpacing: 4, marginTop: 4 },
  input: { backgroundColor: NAVY2, color: WHITE, borderRadius: 10, padding: 12, marginVertical: 6, borderWidth: 1, borderColor: '#244a80' },
  btn: { backgroundColor: GOLD, borderRadius: 10, padding: 14, alignItems: 'center', marginVertical: 6 }, ghost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: GOLD },
  btnT: { color: NAVY, fontWeight: '800', letterSpacing: 1 }, btnT2: { color: GOLD, fontWeight: '700', letterSpacing: 1 },
  link: { color: GOLD, textAlign: 'center', marginTop: 14 },
  h1: { color: WHITE, fontSize: 22, fontWeight: '800', marginVertical: 8 }, h2: { color: GOLD, fontSize: 16, fontWeight: '700', margin: 16, marginBottom: 8 },
  hello: { color: WHITE, fontSize: 20, fontWeight: '700', margin: 16 }, body: { color: '#dbe4f0', fontSize: 15, lineHeight: 22, marginVertical: 8 },
  warn: { color: '#ffb86b', backgroundColor: '#3a2a10', padding: 10, borderRadius: 8, margin: 12, textAlign: 'center' },
  wallet: { backgroundColor: NAVY2, margin: 16, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: GOLD },
  big: { color: GOLD, fontSize: 34, fontWeight: '800', marginVertical: 6 }, price: { color: GOLD, fontWeight: '800', fontSize: 16 },
  cardT: { color: WHITE, fontWeight: '600', fontSize: 14 }, cardA: { color: MUTED, fontSize: 12, marginTop: 2 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: NAVY2, marginHorizontal: 16, marginVertical: 4, padding: 14, borderRadius: 12, gap: 8 },
  net: { flex: 1, alignItems: 'center', padding: 10, margin: 4, borderRadius: 12, borderWidth: 1, borderColor: '#244a80' },
  chip: { borderWidth: 1, borderColor: GOLD, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, margin: 4 }, chipT: { color: GOLD, fontSize: 12, fontWeight: '700' },
  modalBg: { flex: 1, backgroundColor: '#000a', justifyContent: 'flex-end' }, sheet: { backgroundColor: NAVY, padding: 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 2, borderColor: GOLD },
  rrow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#244a80' }, rv: { color: WHITE, fontWeight: '600', flexShrink: 1, textAlign: 'right', marginLeft: 12 },
  stat: { width: '48%', backgroundColor: NAVY2, padding: 14, borderRadius: 12, margin: '1%' }, tool: { color: GOLD, fontWeight: '700', fontSize: 12, marginTop: 6 },
});
