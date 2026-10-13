import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { KeyboardDismissTextInput as TextInput } from "./KeyboardDismissTextInput";

export type ConversationPerson = { id?: string | null; display_name?: string | null; username?: string | null; avatar_url?: string | null };
export type ConversationMessage = { id: string; sender_id: string; body: string; created_at: string; profiles?: ConversationPerson | ConversationPerson[] | null };
type Props = {
  messages: ConversationMessage[]; userId: string | null; ownProfile: ConversationPerson | null; partner: ConversationPerson | null;
  partnerId: string | null; creatorId: string | null; mode: "public" | "private"; questTitle: string; draft: string; search: string;
  loading: boolean; error: string; sending: boolean; onDraft: (text: string) => void; onSearch: (text: string) => void;
  onSend: () => void; onRetry: () => void; onBack: () => void; onListing: () => void; onProfile: (id: string) => void; onMode: (mode: "public" | "private") => void;
};
const personLabel = (person: ConversationPerson | null | undefined) => person?.display_name || person?.username || "QuestHat member";
export function ConversationPanel(p: Props) {
  const scroll = useRef<ScrollView>(null);
  const nearBottom = useRef(true);
  const previousCount = useRef(p.messages.length);
  const [showLatest, setShowLatest] = useState(false);
  useEffect(() => {
    if (p.messages.length > previousCount.current && !nearBottom.current) queueMicrotask(() => setShowLatest(true));
    previousCount.current = p.messages.length;
  }, [p.messages.length]);
  const jump = () => { nearBottom.current = true; setShowLatest(false); scroll.current?.scrollToEnd({ animated: true }); };
  const visible = p.messages.filter(m => { const author = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles; return !p.search || [m.body, personLabel(author)].some(v => v.toLowerCase().includes(p.search.toLowerCase())); });
  const timestamp = (value: string) => { const date = new Date(value); return Number.isNaN(+date) ? "" : date.toLocaleString(undefined, { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }); };
  return <View style={s.panel}>
    <View style={s.header}>
      <Pressable style={s.back} onPress={p.onBack} accessibilityRole="button" accessibilityLabel="Back to Inbox"><Ionicons name="chevron-back" size={18} color="#151923" /><Text style={s.backText}>Inbox</Text></Pressable>
      <View style={[s.privacy,p.mode === "public" && s.public]}><Text style={[s.privacyText,p.mode === "public" && s.publicText]}>{p.mode === "private" ? `Private with ${personLabel(p.partner)}` : "Public conversation"}</Text></View>
      <Pressable style={s.listing} onPress={p.onListing} accessibilityRole="button"><Text style={s.listingText}>Open listing ↗</Text></Pressable>
    </View>
    <Text style={s.quest} numberOfLines={1}>About {p.questTitle}</Text>
    <View style={s.tools}><View style={s.modes}>{(["public","private"] as const).map(mode=><Pressable key={mode} style={[s.mode,p.mode===mode&&s.modeActive]} onPress={()=>p.onMode(mode)} accessibilityRole="button" accessibilityState={{selected:p.mode===mode}}><Text style={s.modeText}>{mode === "public" ? "Comments" : "Messages"}</Text></Pressable>)}</View><TextInput accessibilityLabel="Search conversation" value={p.search} onChangeText={p.onSearch} placeholder="Search messages" placeholderTextColor="#737982" style={s.search} clearButtonMode="while-editing" /></View>
    {p.error ? <View style={s.error} accessibilityRole="alert"><Text style={s.errorText}>{p.error}</Text><Pressable accessibilityRole="button" onPress={p.onRetry} style={s.retry}><Text style={s.listingText}>Try again</Text></Pressable></View> : null}
    <ScrollView testID="conversation-messages" ref={scroll} style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" automaticallyAdjustKeyboardInsets scrollEventThrottle={16} onScroll={e=>{const {layoutMeasurement,contentOffset,contentSize}=e.nativeEvent;nearBottom.current=contentSize.height-contentOffset.y-layoutMeasurement.height<72;if(nearBottom.current)setShowLatest(false);}} onContentSizeChange={()=>{if(nearBottom.current&&!p.search)scroll.current?.scrollToEnd({animated:false});}}>
      {p.loading ? <ActivityIndicator accessibilityLabel="Loading messages" color="#0e5969" /> : !visible.length ? <Text style={s.empty}>{p.search ? "No messages match that search." : "No messages yet. Start the conversation."}</Text> : visible.map(m=>{
        const own=m.sender_id===p.userId; const relation=Array.isArray(m.profiles)?m.profiles[0]:m.profiles;const author=own ? p.ownProfile || relation : relation || (m.sender_id===p.partnerId?p.partner:null);const label=own?"You":personLabel(author);return <View key={m.id} style={[s.message,own&&s.own]}>
          <Pressable onPress={()=>p.onProfile(m.sender_id)} accessibilityLabel={own?"Your profile":`Open ${label}'s profile`} style={s.avatar}>{author?.avatar_url?<Image source={{uri:author.avatar_url}} style={s.avatarImage}/>:<Text style={s.initial}>{label.charAt(0).toUpperCase()}</Text>}</Pressable>
          <View style={[s.copy,own&&s.ownCopy]}><View style={[s.meta,own&&s.ownMeta]}><Pressable onPress={()=>p.onProfile(m.sender_id)}><Text style={s.name}>{label}</Text></Pressable>{m.sender_id===p.creatorId?<Text style={s.organizer}>Organizer</Text>:null}<Text style={s.time}>{timestamp(m.created_at)}</Text></View><View style={[s.bubble,own&&s.ownBubble]}><Text style={[s.body,own&&s.ownBody]}>{m.body.replace(/^\[(PUBLIC|PRIVATE[^\]]*)\]\s*/i,"")}</Text></View></View>
        </View>;
      })}
    </ScrollView>
    {showLatest?<Pressable accessibilityRole="button" style={s.latest} onPress={jump}><Text style={s.latestText}>New messages · Jump to latest</Text></Pressable>:null}
    <View style={s.composer}><TextInput multiline accessibilityLabel="Your message" value={p.draft} onChangeText={p.onDraft} maxLength={500} placeholder={p.mode==="private"?"Reply in private thread…":"Write a public comment…"} placeholderTextColor="#858b93" style={s.input}/><Pressable accessibilityRole="button" accessibilityLabel="Send message" disabled={p.sending||!p.draft.trim()} style={[s.send,(p.sending||!p.draft.trim())&&s.disabled]} onPress={()=>{nearBottom.current=true;p.onSend();}}>{p.sending?<ActivityIndicator color="#fff"/>:<Text style={s.sendText}>Send</Text>}</Pressable></View>
    <View style={s.hints}><Text style={s.hint}>{p.mode==="public"?"Visible to everyone on this quest":"Only conversation participants can see this."}</Text><Text style={s.hint}>{p.draft.length}/500</Text></View>
  </View>;
}
const s=StyleSheet.create({
  panel:{flex:1,minHeight:0,backgroundColor:"#fff",borderRadius:24,overflow:"hidden"},header:{flexDirection:"row",alignItems:"center",flexWrap:"wrap",gap:8,padding:12,borderBottomWidth:1,borderBottomColor:"#e8e9ed"},back:{flexDirection:"row",alignItems:"center",minHeight:44,gap:4,paddingHorizontal:10,borderWidth:1,borderColor:"#e8e9ed",borderRadius:16},backText:{color:"#151923",fontSize:13,fontWeight:"600"},privacy:{backgroundColor:"#f6eafd",paddingHorizontal:10,paddingVertical:10,borderRadius:16,flexShrink:1},privacyText:{color:"#8017b5",fontSize:12},public:{backgroundColor:"#e8f7f0"},publicText:{color:"#17614d"},listing:{minHeight:44,justifyContent:"center",paddingHorizontal:4},listingText:{color:"#0f5969",fontSize:12,textDecorationLine:"underline"},quest:{color:"#737982",fontSize:11,marginHorizontal:12,marginTop:8},tools:{flexDirection:"row",gap:8,padding:10},modes:{flexDirection:"row",backgroundColor:"#f0f1f5",borderRadius:12,padding:3},mode:{minHeight:40,justifyContent:"center",paddingHorizontal:8,borderRadius:9},modeActive:{backgroundColor:"#dceef2"},modeText:{color:"#17566a",fontSize:11,fontWeight:"600"},search:{flex:1,minWidth:0,minHeight:44,paddingHorizontal:9,borderRadius:12,borderWidth:1,borderColor:"#e8e9ed",fontSize:12,color:"#151923"},scroll:{flex:1,minHeight:0},content:{flexGrow:1,padding:12},message:{flexDirection:"row",alignItems:"flex-start",gap:8,marginBottom:24},own:{flexDirection:"row-reverse"},avatar:{width:34,height:34,borderRadius:17,backgroundColor:"#e4eef1",alignItems:"center",justifyContent:"center",overflow:"hidden"},avatarImage:{width:34,height:34},initial:{color:"#17566a",fontWeight:"800"},copy:{maxWidth:"84%",flexShrink:1,minWidth:0},ownCopy:{alignItems:"flex-end"},meta:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:5,marginBottom:5},ownMeta:{justifyContent:"flex-end"},name:{fontSize:12,fontWeight:"600",color:"#151923"},organizer:{color:"#a25714",backgroundColor:"#fff2df",borderRadius:10,paddingHorizontal:6,paddingVertical:2,fontSize:10},time:{color:"#737982",fontSize:11},bubble:{backgroundColor:"#f0f1f5",borderRadius:17,paddingHorizontal:13,paddingVertical:11},ownBubble:{backgroundColor:"#0e5969"},body:{fontSize:15,lineHeight:22,color:"#151923",flexShrink:1},ownBody:{color:"#fff"},empty:{color:"#737982",paddingVertical:24,textAlign:"center"},composer:{flexDirection:"row",alignItems:"flex-end",gap:8,borderTopWidth:1,borderTopColor:"#e8e9ed",paddingTop:12,marginHorizontal:12},input:{flex:1,minWidth:0,minHeight:48,maxHeight:120,borderWidth:1,borderColor:"#d8dbe0",borderRadius:16,paddingHorizontal:12,paddingVertical:12,fontSize:14,lineHeight:22,color:"#151923"},send:{minHeight:48,minWidth:66,borderRadius:16,backgroundColor:"#0e5969",alignItems:"center",justifyContent:"center",padding:10},sendText:{color:"#fff",fontSize:14,fontWeight:"600"},disabled:{opacity:0.5},hints:{flexDirection:"row",gap:8,justifyContent:"space-between",padding:12},hint:{fontSize:10,color:"#737982",flexShrink:1},error:{backgroundColor:"#fff2ed",padding:10,margin:10,borderRadius:12},errorText:{color:"#9b3523",fontSize:12},retry:{minHeight:44,justifyContent:"center"},latest:{backgroundColor:"#e8f3f6",padding:12,alignItems:"center"},latestText:{color:"#17566a",fontSize:12,fontWeight:"600"}
});
