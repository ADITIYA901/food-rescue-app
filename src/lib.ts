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

export const seeds: Listing[] = [
 {id:'seed-1',name:'Seasonal vegetable boxes',category:'Produce',quantity:24,unit:'boxes',location:'Indiranagar, Bengaluru',donor:'The Green Table',image:'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=900&q=85',prepared:'Today, 10:30 AM',expires:'Today, 8:00 PM',deadline:'Today, 4:00 PM',status:'Available',description:'Fresh farm vegetables, sorted and packed this morning.',createdAt:new Date().toISOString()},
 {id:'seed-2',name:'Freshly baked sourdough & rolls',category:'Bakery',quantity:38,unit:'portions',location:'Koramangala, Bengaluru',donor:'Olive & Oak Bakery',image:'https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=900&q=85',prepared:'Today, 8:00 AM',expires:'Today, 7:00 PM',deadline:'Today, 2:30 PM',status:'Available',description:'Assorted breads baked early today. Stored in food-safe bags.',createdAt:new Date().toISOString()},
 {id:'seed-3',name:'Wholesome lunch bowls',category:'Prepared meals',quantity:32,unit:'meals',location:'MG Road, Bengaluru',donor:'Harvest Kitchen',image:'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=85',prepared:'Today, 11:45 AM',expires:'Today, 5:00 PM',deadline:'Today, 1:45 PM',status:'Available',description:'Balanced rice, dal and seasonal vegetable bowls. Vegetarian.',createdAt:new Date().toISOString()},
 {id:'seed-4',name:'Farm-fresh fruit assortment',category:'Produce',quantity:16,unit:'crates',location:'Jayanagar, Bengaluru',donor:'Sunrise Supermarket',image:'https://images.unsplash.com/photo-1610832958506-aa56368176cf?auto=format&fit=crop&w=900&q=85',prepared:'Today, 9:15 AM',expires:'Tomorrow, 12:00 PM',deadline:'Today, 5:30 PM',status:'Available',description:'A colourful mix of ripe bananas, apples and oranges.',createdAt:new Date().toISOString()},
 {id:'seed-5',name:'Warm vegetable biryani',category:'Prepared meals',quantity:45,unit:'meals',location:'Whitefield, Bengaluru',donor:'Spice Route Hotel',image:'https://images.unsplash.com/photo-1563379091339-03246963d96a?auto=format&fit=crop&w=900&q=85',prepared:'Today, 12:15 PM',expires:'Today, 6:30 PM',deadline:'Today, 2:00 PM',status:'Available',description:'Fresh vegetarian biryani packed in individual containers.',createdAt:new Date().toISOString()},
]
const seedRequests: FoodRequest[] = [
 {id:'req-1',listingId:'seed-3',ngo:'Hope Community Kitchen',quantity:20,status:'Pending',createdAt:new Date().toISOString()},
 {id:'req-2',listingId:'seed-5',ngo:'Annapoorna Foundation',quantity:30,status:'Approved',createdAt:new Date().toISOString()},
]
const demoReports:PlatformReport[]=[{id:'demo-report-1',listingId:'seed-2',listingName:'Freshly baked sourdough & rolls',reason:'Please confirm today’s pickup window.',status:'open',createdAt:'Today'}]
const read = <T,>(key:string,fallback:T):T => { try { const raw=localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback } catch { return fallback } }
export const getListings = () => read<Listing[]>('foodloop_listings',seeds)
export const getRequests = () => read<FoodRequest[]>('foodloop_requests',seedRequests)
export const saveLocal = (key:string,value:unknown) => localStorage.setItem(key,JSON.stringify(value))
export async function loadImpact():Promise<ImpactMetrics>{
 if(!supabase)return {foodKg:2840,meals:5680,completed:146,ngos:24,members:1284}
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
 return (data||[]).map((r:any)=>({id:r.id,name:r.name,category:r.category,quantity:Number(r.quantity),unit:r.unit,location:r.pickup_location,latitude:r.latitude,longitude:r.longitude,donor:r.donor_display_name||'Community donor',donorId:r.donor_id,image:r.image_url||seeds[0].image,prepared:r.prepared_at?new Date(r.prepared_at).toLocaleString():'Today',expires:new Date(r.expires_at).toLocaleString(),deadline:new Date(r.collection_deadline).toLocaleString(),status:r.status==='available'?'Available':r.status==='collected'?'Collected':'Reserved',description:r.description||'',createdAt:r.created_at}))
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
 const rows=[...getRequests(),{id:crypto.randomUUID(),listingId:listing.id,ngo:profile?.name||'Hope Community Kitchen',ngoId:profile?.id,quantity,status:'Pending' as const,createdAt:new Date().toISOString()}];saveLocal('foodloop_requests',rows);return rows
}
export async function updateRequestStatus(request:FoodRequest,status:'Approved'|'Rejected'|'Collected'):Promise<void> {
 if(supabase){const {error}=await supabase.rpc('respond_to_request',{p_request_id:request.id,p_status:status.toLowerCase()});if(error)throw error;return}
 const rows=getRequests().map(r=>r.id===request.id?{...r,status}:r);saveLocal('foodloop_requests',rows);if(status==='Approved'||status==='Collected'){const ls=getListings().map(l=>l.id===request.listingId?{...l,status:status==='Collected'?'Collected' as const:'Reserved' as const}:l);saveLocal('foodloop_listings',ls)}
}
export async function loadPendingNgos():Promise<NgoApplication[]> {
 if(!supabase)return read<NgoApplication[]>('foodloop_ngo_queue',[{id:'demo-ngo-1',name:'Nourish Together Trust',location:'HSR Layout, Bengaluru',createdAt:'2 hours ago'},{id:'demo-ngo-2',name:'The Open Plate Collective',location:'BTM Layout, Bengaluru',createdAt:'yesterday'},{id:'demo-ngo-3',name:'Sahaara Children’s Home',location:'Rajajinagar, Bengaluru',createdAt:'2 days ago'}])
 const {data,error}=await supabase.from('profiles').select('id,name,location,created_at,ngo_details!inner(review_status)').eq('role','ngo').eq('ngo_details.review_status','pending').order('created_at',{ascending:false});if(error)throw error
 return (data||[]).map((r:any)=>({id:r.id,name:r.name,location:r.location||'Location not provided',createdAt:new Date(r.created_at).toLocaleDateString()}))
}
export async function verifyNgo(id:string,approved:boolean):Promise<void>{
 if(!supabase){saveLocal('foodloop_ngo_queue',loadPendingNgosSync().filter(n=>n.id!==id));return}
 const {error}=await supabase.rpc('admin_verify_ngo',{p_profile_id:id,p_approved:approved});if(error)throw error
}
function loadPendingNgosSync():NgoApplication[]{return read<NgoApplication[]>('foodloop_ngo_queue',[{id:'demo-ngo-1',name:'Nourish Together Trust',location:'HSR Layout, Bengaluru',createdAt:'2 hours ago'},{id:'demo-ngo-2',name:'The Open Plate Collective',location:'BTM Layout, Bengaluru',createdAt:'yesterday'},{id:'demo-ngo-3',name:'Sahaara Children’s Home',location:'Rajajinagar, Bengaluru',createdAt:'2 days ago'}])}
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
 if(!supabase)return read<AdminUser[]>('foodloop_admin_users',[{id:'demo-user-1',name:'The Green Table',role:'Donor',location:'Indiranagar',active:true,verified:true},{id:'demo-user-2',name:'Hope Community Kitchen',role:'NGO',location:'Koramangala',active:true,verified:true},{id:'demo-user-3',name:'Olive & Oak Bakery',role:'Donor',location:'Koramangala',active:true,verified:true}])
 const {data,error}=await supabase.from('profiles').select('id,name,role,location,verified,is_active').order('created_at',{ascending:false}).limit(30);if(error)throw error
 return (data||[]).map((u:any)=>({id:u.id,name:u.name,role:u.role==='ngo'?'NGO':u.role==='admin'?'Admin':'Donor',location:u.location||'—',active:u.is_active,verified:u.verified}))
}
export async function setAdminUserActive(id:string,active:boolean):Promise<void>{
 if(!supabase){saveLocal('foodloop_admin_users',(await loadAdminUsers()).map(u=>u.id===id?{...u,active}:u));return}
 const {error}=await supabase.rpc('admin_set_user_active',{p_profile_id:id,p_active:active});if(error)throw error
}
