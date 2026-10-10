import { createClient, SupabaseClient } from '@supabase/supabase-js'

export type Role = 'Donor' | 'NGO' | 'Admin'
export type Listing = { id:string; name:string; category:string; quantity:number; unit:string; location:string; latitude?:number|null; longitude?:number|null; donor:string; donorId?:string; image:string; prepared:string; expires:string; deadline:string; status:'Available'|'Reserved'|'Collected'; description:string; createdAt:string }
export type FoodRequest = { id:string; listingId:string; ngo:string; ngoId?:string; quantity:number; status:'Pending'|'Approved'|'Rejected'|'Collected'; createdAt:string }
export type Profile = { id:string; name:string; role:Role; location:string; verified:boolean }
export type NgoApplication = { id:string; name:string; location:string; createdAt:string }
export type ImpactMetrics = { foodKg:number; meals:number; completed:number; ngos:number; members:number }
export type PlatformReport = { id:string; listingId:string; listingName:string; reason:string; status:'open'|'reviewed'|'resolved'; createdAt:string }
export type MatchRecipient = { id:string; name:string; place:string; need:string; cap:number; accept:number; initials:string; color:string; latitude?:number|null; longitude?:number|null; distanceKm:number|null; requirementFit:number; historyCount:number }
export type AdminUser = { id:string; name:string; role:Role; location:string; active:boolean; verified:boolean }

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
export const demoMode = !supabase

const imageFallback='https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=80'
export const seeds: Listing[] = []
const seedRequests: FoodRequest[] = []
const demoReports:PlatformReport[]=[]
const read = <T,>(key:string,fallback:T):T => { try { const raw=localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback } }
function removeStarterRecords(){
 try {
  const listings=read<Listing[]>('foodloop_listings',[]),cleanListings=listings.filter(x=>!x.id.startsWith('seed-'))
  if(cleanListings.length!==listings.length)localStorage.setItem('foodloop_listings',JSON.stringify(cleanListings))
  const requests=read<FoodRequest[]>('foodloop_requests',[]),cleanRequests=requests.filter(x=>!x.id.startsWith('req-')&&!x.listingId.startsWith('seed-'))
  if(cleanRequests.length!==requests.length)localStorage.setItem('foodloop_requests',JSON.stringify(cleanRequests))
  for(const [key,prefix] of [['foodloop_reports','demo-report-'],['foodloop_admin_users','demo-user-'],['foodloop_ngo_queue','demo-ngo-']] as const){
   const rows=read<{id:string}[]>(key,[]),clean=rows.filter(x=>!x.id.startsWith(prefix))
   if(clean.length!==rows.length)localStorage.setItem(key,JSON.stringify(clean))
  }
 } catch { /* Storage may be unavailable; empty defaults still keep demo mode usable. */ }
}
removeStarterRecords()
export const getListings = () => read<Listing[]>('foodloop_listings',seeds)
export const getRequests = () => read<FoodRequest[]>('foodloop_requests',seedRequests)
export const saveLocal = (key:string,value:unknown) => localStorage.setItem(key,JSON.stringify(value))
export async function loadImpact():Promise<ImpactMetrics>{
 if(!supabase)return {foodKg:0,meals:0,completed:0,ngos:0,members:0}
 const {data,error}=await supabase.rpc('get_impact_summary');if(error)throw error
 return {foodKg:Number(data.food_kg)||0,meals:Number(data.meals)||0,completed:Number(data.completed)||0,ngos:Number(data.ngos)||0,members:Number(data.members)||0}
}
export async function loadMatchRecipients():Promise<MatchRecipient[]>{
 if(!supabase)return []
 const {data,error}=await supabase.rpc('get_ngo_matching_profiles');if(error)throw error
 const colors=['sage','peach','lavender'];return (data||[]).map((r:any,i:number)=>({id:r.id,name:r.name,place:r.location||'Location not provided',need:(r.food_requirements||[]).join(' · ')||'Open to all categories',cap:Number(r.max_quantity)||50,accept:Math.round(Number(r.acceptance_rate||.5)*100),initials:(r.name||'NG').slice(0,2).toUpperCase(),color:colors[i%colors.length],latitude:r.latitude,longitude:r.longitude,distanceKm:null,requirementFit:1,historyCount:Number(r.history_count)||0}))
}

export async function loadListings():Promise<Listing[]> {
 if (!supabase) return getListings()
 const {data,error}=await supabase.from('food_listings').select('*').order('created_at',{ascending:false})
 if (error) throw error
  return (data||[]).map((r:any)=>({id:r.id,name:r.name,category:r.category,quantity:Number(r.quantity),unit:r.unit,location:r.pickup_location,latitude:r.latitude,longitude:r.longitude,donor:r.donor_display_name||'Community donor',donorId:r.donor_id,image:r.image_url||imageFallback,prepared:r.prepared_at?new Date(r.prepared_at).toLocaleString():'Today',expires:new Date(r.expires_at).toLocaleString(),deadline:new Date(r.collection_deadline).toLocaleString(),status:r.status==='available'?'Available':r.status==='collected'?'Collected':'Reserved',description:r.description||'',createdAt:r.created_at}))
}
export async function uploadFoodImage(file:File,profile:Profile|null):Promise<string>{
 if(!supabase||!profile)throw new Error('Sign in to upload images to FoodLoop storage.')
 const ext=file.name.split('.').pop()?.toLowerCase()||'jpg'
 const path=`${profile.id}/${crypto.randomUUID()}.${ext}`
 const {error}=await supabase.storage.from('food-images').upload(path,file,{contentType:file.type,upsert:false})
 if(error)throw error
 return supabase.storage.from('food-images').getPublicUrl(path).data.publicUrl
}
export async function createListing(input:Omit<Listing,'id'|'donor'|'status'|'createdAt'>,profile:Profile|null):Promise<Listing> {
 if(supabase&&!profile)throw new Error('Sign in before publishing a donation.')
 if (supabase && profile) {
  const {data,error}=await supabase.from('food_listings').insert({name:input.name,category:input.category,quantity:input.quantity,unit:input.unit,pickup_location:input.location,latitude:input.latitude,longitude:input.longitude,prepared_at:input.prepared,expires_at:input.expires,collection_deadline:input.deadline,image_url:input.image,description:input.description,donor_id:profile.id}).select().single()
  if(error)throw error
  const row:Listing={...input,id:data.id,donor:profile.name,donorId:profile.id,status:'Available',createdAt:data.created_at}; return row
 }
 const next=[...getListings(),{...input,id:crypto.randomUUID(),donor:profile?.name||'Your organization',donorId:profile?.id,status:'Available' as const,createdAt:new Date().toISOString()}]; saveLocal('foodloop_listings',next); return next[next.length-1]
}
export async function loadRequests():Promise<FoodRequest[]> {
 if(!supabase)return getRequests()
 const {data:{user}}=await supabase.auth.getUser();if(!user)return []
 const {data,error}=await supabase.from('donation_requests').select('id,listing_id,ngo_id,quantity,status,created_at,profiles:ngo_id(name)')
 if(error)throw error
 return (data||[]).map((r:any)=>({id:r.id,listingId:r.listing_id,ngo:r.profiles?.name||'Recipient',ngoId:r.ngo_id,quantity:Number(r.quantity),status:r.status[0].toUpperCase()+r.status.slice(1),createdAt:r.created_at}))
}
export async function requestFood(listing:Listing,quantity:number,profile:Profile|null):Promise<FoodRequest[]> {
 if(supabase&&!profile)throw new Error('Sign in as an NGO before requesting food.')
 if(supabase&&profile) { const {error}=await supabase.from('donation_requests').insert({listing_id:listing.id,ngo_id:profile.id,quantity}); if(error)throw error; return loadRequests() }
 const rows=[...getRequests(),{id:crypto.randomUUID(),listingId:listing.id,ngo:profile?.name||'Demo recipient',ngoId:profile?.id,quantity,status:'Pending' as const,createdAt:new Date().toISOString()}];saveLocal('foodloop_requests',rows);return rows
}
export async function updateRequestStatus(request:FoodRequest,status:'Approved'|'Rejected'|'Collected'):Promise<void> {
 if(supabase){const {error}=await supabase.rpc('respond_to_request',{p_request_id:request.id,p_status:status.toLowerCase()});if(error)throw error;return}
 const rows=getRequests().map(r=>r.id===request.id?{...r,status}:r);saveLocal('foodloop_requests',rows);if(status==='Approved'||status==='Collected'){const ls=getListings().map(l=>l.id===request.listingId?{...l,status:status==='Collected'?'Collected' as const:'Reserved' as const}:l);saveLocal('foodloop_listings',ls)}
}
export async function loadPendingNgos():Promise<NgoApplication[]> {
 if(!supabase)return read<NgoApplication[]>('foodloop_ngo_queue',[])
 const {data,error}=await supabase.from('profiles').select('id,name,location,created_at,ngo_details!inner(review_status)').eq('role','ngo').eq('ngo_details.review_status','pending').order('created_at',{ascending:false});if(error)throw error
 return (data||[]).map((r:any)=>({id:r.id,name:r.name,location:r.location||'Location not provided',createdAt:new Date(r.created_at).toLocaleDateString()}))
}
export async function verifyNgo(id:string,approved:boolean):Promise<void>{
 if(!supabase){saveLocal('foodloop_ngo_queue',loadPendingNgosSync().filter(n=>n.id!==id));return}
 const {error}=await supabase.rpc('admin_verify_ngo',{p_profile_id:id,p_approved:approved});if(error)throw error
}
function loadPendingNgosSync():NgoApplication[]{return read<NgoApplication[]>('foodloop_ngo_queue',[])}
export async function loadReports():Promise<PlatformReport[]>{
 if(!supabase)return read<PlatformReport[]>('foodloop_reports',demoReports)
 const {data,error}=await supabase.from('platform_reports').select('id,listing_id,reason,status,created_at,food_listings(name)').order('created_at',{ascending:false});if(error)throw error
 return (data||[]).map((r:any)=>({id:r.id,listingId:r.listing_id,listingName:r.food_listings?.name||'Removed listing',reason:r.reason,status:r.status,createdAt:new Date(r.created_at).toLocaleDateString()}))
}
export async function createReport(listing:Listing,profile:Profile|null):Promise<void>{
 if(supabase){if(!profile)throw new Error('Sign in before reporting a listing.');const {error}=await supabase.from('platform_reports').insert({listing_id:listing.id,reporter_id:profile.id,reason:'Please review this listing information.'});if(error)throw error;return}
 const reports=read<PlatformReport[]>('foodloop_reports',demoReports);reports.unshift({id:crypto.randomUUID(),listingId:listing.id,listingName:listing.name,reason:'Please review this listing information.',status:'open',createdAt:'Just now'});saveLocal('foodloop_reports',reports)
}
export async function updateReportStatus(id:string,status:'reviewed'|'resolved'):Promise<void>{
 if(supabase){const {error}=await supabase.rpc('admin_update_report',{p_report_id:id,p_status:status});if(error)throw error;return}
 const reports=read<PlatformReport[]>('foodloop_reports',demoReports).map(report=>report.id===id?{...report,status}:report);saveLocal('foodloop_reports',reports)
}
export async function loadAdminUsers():Promise<AdminUser[]>{
 if(!supabase)return read<AdminUser[]>('foodloop_admin_users',[])
 const {data,error}=await supabase.from('profiles').select('id,name,role,location,verified,is_active').order('created_at',{ascending:false}).limit(30);if(error)throw error
 return (data||[]).map((u:any)=>({id:u.id,name:u.name,role:u.role==='ngo'?'NGO':u.role==='admin'?'Admin':'Donor',location:u.location||'—',active:u.is_active,verified:u.verified}))
}
export async function setAdminUserActive(id:string,active:boolean):Promise<void>{
 if(!supabase){saveLocal('foodloop_admin_users',(await loadAdminUsers()).map(u=>u.id===id?{...u,active}:u));return}
 const {error}=await supabase.rpc('admin_set_user_active',{p_profile_id:id,p_active:active});if(error)throw error
}
