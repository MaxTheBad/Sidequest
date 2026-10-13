export const SETTINGS_SECTIONS = [
 {key:"profile",label:"Profile",icon:"user",eyebrow:"PUBLIC PROFILE",title:"How people see you"},
 {key:"preferences",label:"Preferences",icon:"tune",eyebrow:"YOUR EXPERIENCE",title:"Look, feel & alerts"},
 {key:"friends",label:"People",icon:"people",eyebrow:"YOUR CIRCLE",title:"People & safety"},
 {key:"account",label:"Account",icon:"shield",eyebrow:"SECURITY & ACCESS",title:"Your account"},
];
export function primarySettingsSection(tab) {
 return tab === "notifications" ? "preferences" : tab === "blocked" ? "friends" : tab === "connected" ? "account" : tab;
}
export function nextSettingsSection(current,key) {
 const index=SETTINGS_SECTIONS.findIndex(item=>item.key===primarySettingsSection(current));
 if(key==="Home")return SETTINGS_SECTIONS[0].key;
 if(key==="End")return SETTINGS_SECTIONS.at(-1).key;
 if(key!=="ArrowRight"&&key!=="ArrowLeft")return null;
 return SETTINGS_SECTIONS[(index+(key==="ArrowRight"?1:-1)+SETTINGS_SECTIONS.length)%SETTINGS_SECTIONS.length].key;
}
